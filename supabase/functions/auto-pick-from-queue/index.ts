// Supabase Edge Function: auto-pick-from-queue
//
// Triggered by a Supabase database webhook on draft_state UPDATE events.
// When current_pick advances (a pick was just made), this function checks
// the picker's auto-pick mode. If queue-only is enabled, it immediately
// picks the top available queue item. If general mode is enabled, it
// uses the queue first, then falls back to best EP.
//
// Cascade: after picking, this function updates draft_state.current_pick,
// which fires the webhook again for the next picker — cascading through
// consecutive auto-pick-enabled members until one is not enabled or has
// an empty queue.
//
// Race protection: draft_picks has a UNIQUE (league_id, pick_number)
// constraint. If client-side and server-side both try to pick the same slot,
// the second attempt gets a unique violation and returns gracefully.
//
// Setup (Supabase Dashboard):
//   Database → Webhooks → Create a new hook
//   Table: draft_state | Events: Update
//   Type: HTTP Request | URL: {SUPABASE_URL}/functions/v1/auto-pick-from-queue
//   HTTP Headers: Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
//
// Required secrets (auto-injected):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional secrets:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (for OTC emails)

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getPickerIndex,
  normalizeDraftPicker,
  sendEmail,
  escapeHtml,
  wouldBreakSportCoverage,
  buildCandidates,
  getQueueAutopick,
  fetchExpectedPoints,
} from '../_shared/draft-helpers.ts';
import { getTeamPoolForSport } from '../_shared/team-pools.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();

    // Only handle UPDATE events where current_pick actually advanced
    if (payload.type !== 'UPDATE') return skip('not an UPDATE event');
    const newState = payload.record;
    const oldState = payload.old_record;
    if (!newState || !oldState) return skip('missing record data');
    if (newState.current_pick === oldState.current_pick) return skip('current_pick unchanged');

    const leagueId   = newState.league_id;
    const currentPick = newState.current_pick;
    const currentRound = newState.current_round;
    if (!leagueId || !currentPick) return skip('missing leagueId or currentPick');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load league and existing picks in parallel
    const [{ data: league }, { data: existingPicks }] = await Promise.all([
      admin.from('leagues').select('name, draft_rounds, sports, draft_timer').eq('id', leagueId).single(),
      admin.from('draft_picks').select('pick_number, sport, team_name, picker_email').eq('league_id', leagueId),
    ]);

    if (!league) return skip('league not found');

    // Draft complete check
    const draftOrder = newState.draft_order || [];
    const numMembers = draftOrder.length;
    const maxPicks = numMembers > 0 && (league.draft_rounds || 0) > 0
      ? numMembers * league.draft_rounds
      : null;
    if (maxPicks && currentPick > maxPicks) return skip('draft complete');

    // Dedup: bail if this pick slot is already filled (client beat us to it)
    const alreadyPicked = (existingPicks || []).some(p => p.pick_number === currentPick);
    if (alreadyPicked) return skip(`pick ${currentPick} already exists`);

    // Determine who is now on the clock
    const pickerIdx = getPickerIndex({
      currentPick,
      currentRound,
      numMembers,
      isSnake: newState.is_snake ?? true,
      thirdRoundReversal: !!newState.third_round_reversal,
    });
    const picker = normalizeDraftPicker(draftOrder[pickerIdx]);
    if (!picker?.email) return skip('picker email unknown');

    // Always send OTC email for the new current picker (server-side reliability).
    // This covers the case where the previous picker's tab closed before the client-side
    // 1500ms setTimeout fired. Uses draft_reminders dedup to prevent double-sends with
    // the client-side send-otc-email call.
    sendOtcEmailDeduped(admin, leagueId, league, newState, currentPick, currentRound, numMembers).catch(e =>
      console.warn('auto-pick-from-queue: OTC email error', e)
    );

    // Check if this picker has auto-pick enabled
    const { data: memberSettings } = await admin
      .from('draft_member_settings')
      .select('auto_pick_from_queue, auto_pick_general')
      .eq('league_id', leagueId)
      .eq('user_email', picker.email)
      .maybeSingle();

    const autoPickQueue = !!memberSettings?.auto_pick_from_queue;
    const autoPickGeneral = !!memberSettings?.auto_pick_general;
    if (!autoPickQueue && !autoPickGeneral) return skip(`auto-pick not enabled for ${picker.email}`);

    // Fetch picker's queue ordered by position
    const { data: queue } = await admin
      .from('draft_queue')
      .select('id, sport, team, position')
      .eq('league_id', leagueId)
      .eq('user_email', picker.email)
      .order('position', { ascending: true });

    let chosen = getQueueAutopick(queue || [], existingPicks || [], league, newState, picker.email);
    if (!chosen && autoPickGeneral) {
      const epMap = await fetchExpectedPoints(admin, league.sports || []);
      const candidates = buildCandidates(picker.email, existingPicks || [], league, newState, epMap);
      if (candidates.length === 0) return skip('no valid candidates');
      const withEp = candidates.filter(c => c.ep != null);
      chosen = withEp.length > 0
        ? withEp.sort((a, b) => (b.ep ?? -Infinity) - (a.ep ?? -Infinity))[0]
        : candidates[0];
    }
    if (!chosen) return skip('no valid queue item');

    // Insert the pick
    const pickName = picker.name || picker.email.split('@')[0] || 'Unknown';
    const { error: pickError } = await admin.from('draft_picks').insert([{
      league_id: leagueId,
      pick_number: currentPick,
      round: currentRound,
      picker_email: picker.email,
      picker_name: pickName,
      sport: chosen.sport,
      team: chosen.team,
      team_name: chosen.team,
    }]);

    if (pickError) {
      // Unique violation means client already picked this slot — not an error
      if (pickError.code === '23505') return skip('unique violation — pick already inserted by client');
      console.error('auto-pick-from-queue: insert error', pickError);
      return new Response(JSON.stringify({ error: pickError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Advance draft_state to the next pick
    const nextPick  = currentPick + 1;
    const nextRound = Math.ceil(nextPick / numMembers);
    const { error: stateError } = await admin.from('draft_state').update({
      current_pick: nextPick,
      current_round: nextRound,
      pick_started_at: new Date().toISOString(),
    }).eq('league_id', leagueId);

    if (stateError) console.error('auto-pick-from-queue: state update error', stateError);

    // Fire OTC email for the next picker (best-effort, don't await)
    sendOtcEmailForNextPick(admin, leagueId, league.name, league.draft_timer, newState, nextPick, nextRound, numMembers).catch(e =>
      console.warn('auto-pick-from-queue: OTC email error', e)
    );

    console.log(`auto-pick-from-queue: picked ${chosen.sport}/${chosen.team} for ${picker.email} (pick ${currentPick})`);

    return new Response(JSON.stringify({
      success: true,
      pickerEmail: picker.email,
      pick: currentPick,
      sport: chosen.sport,
      team: chosen.team,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('auto-pick-from-queue error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Send the OTC email for the next picker after an auto-pick, with dedup.
// Writing the dedup record for nextPick prevents the webhook re-fire (triggered by the
// draft_state update we just made) from double-sending via sendOtcEmailDeduped.
async function sendOtcEmailForNextPick(
  admin: ReturnType<typeof createClient>,
  leagueId: string,
  leagueName: string,
  draftTimer: string | null,
  draftState: Record<string, unknown>,
  nextPick: number,
  nextRound: number,
  numMembers: number,
) {
  const draftOrder = draftState.draft_order as unknown[];
  const pickerIdx = getPickerIndex({
    currentPick: nextPick,
    currentRound: nextRound,
    numMembers,
    isSnake: (draftState.is_snake as boolean) ?? true,
    thirdRoundReversal: !!(draftState.third_round_reversal),
  });
  const nextPicker = normalizeDraftPicker(draftOrder[pickerIdx]);
  if (!nextPicker?.email) return;

  // Claim the dedup slot — if another path already sent for nextPick, bail out
  const { error: insertError } = await admin.from('draft_reminders').insert({
    league_id: leagueId,
    pick_number: nextPick,
    reminder_type: 'otc',
  });
  if (insertError) return; // PK conflict = already sent

  // Check user OTC preference
  const { data: wantsEmail } = await admin.rpc('get_user_otc_pref', { p_email: nextPicker.email });
  if (!wantsEmail) return;

  const appUrl = Deno.env.get('APP_URL') || '';
  const link   = appUrl ? `${appUrl}?draft=${leagueId}` : '';
  const name   = nextPicker.name || nextPicker.email.split('@')[0];
  const subject = `You're on the clock in ${leagueName}!`;
  const text    = `Hi ${name},\n\nIt's your turn to draft in ${leagueName} on Omnifantasy!\n\nDraft now: ${link}\n\nOmnifantasy`;
  const html    = `
    <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p>It's your turn to draft in <strong>${escapeHtml(leagueName)}</strong> on Omnifantasy!</p>
    <p>
      <a href="${escapeHtml(link)}"
         style="background:#16a34a;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0;font-weight:600;">
        Draft Now &#8594;
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px;">Or visit: ${escapeHtml(link)}</p>
  `;

  await sendEmail({ to: nextPicker.email, subject, text, html });
}

// Send OTC email to whoever is currently on the clock, deduped via draft_reminders.
// Called on every current_pick advance so OTC emails are reliable even when the
// previous picker's client tab closes before the 1500ms client-side setTimeout fires.
async function sendOtcEmailDeduped(
  admin: ReturnType<typeof createClient>,
  leagueId: string,
  league: { name: string; draft_timer: string | null },
  draftState: Record<string, unknown>,
  currentPick: number,
  currentRound: number,
  numMembers: number,
) {
  // Claim the dedup slot atomically — PK conflict means another path already sent
  const { error: insertError } = await admin.from('draft_reminders').insert({
    league_id: leagueId,
    pick_number: currentPick,
    reminder_type: 'otc',
  });
  if (insertError) return; // already sent

  const draftOrder = draftState.draft_order as unknown[];
  const pickerIdx = getPickerIndex({
    currentPick,
    currentRound,
    numMembers,
    isSnake: (draftState.is_snake as boolean) ?? true,
    thirdRoundReversal: !!(draftState.third_round_reversal),
  });
  const picker = normalizeDraftPicker(draftOrder[pickerIdx]);
  if (!picker?.email) return;

  const { data: wantsEmail } = await admin.rpc('get_user_otc_pref', { p_email: picker.email });
  if (!wantsEmail) return;

  const appUrl = Deno.env.get('APP_URL') || '';
  const link   = appUrl ? `${appUrl}?draft=${leagueId}` : '';
  const name   = picker.name || picker.email.split('@')[0];
  const subject = `You're on the clock in ${league.name}!`;
  const text    = `Hi ${name},\n\nIt's your turn to draft in ${league.name} on Omnifantasy!\n\nDraft now: ${link}\n\nOmnifantasy`;
  const html    = `
    <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p>It's your turn to draft in <strong>${escapeHtml(league.name)}</strong> on Omnifantasy!</p>
    <p>
      <a href="${escapeHtml(link)}"
         style="background:#16a34a;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0;font-weight:600;">
        Draft Now &#8594;
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px;">Or visit: ${escapeHtml(link)}</p>
  `;

  await sendEmail({ to: picker.email, subject, text, html });
}

// wouldBreakSportCoverage, buildCandidates, getQueueAutopick, fetchExpectedPoints
// are now imported from _shared/draft-helpers.ts

function skip(reason: string) {
  console.log(`auto-pick-from-queue: skipped — ${reason}`);
  return new Response(JSON.stringify({ skipped: reason }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
