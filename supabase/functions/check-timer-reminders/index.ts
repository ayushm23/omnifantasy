// Supabase Edge Function: check-timer-reminders
// Cron job — runs every 15 minutes via pg_cron (see database-migration-draft-reminders.sql).
// Sends a "1 hour left" reminder email to any picker whose timer is within 1 hour of expiring.
// Also performs a server-side auto-pick when a timer has expired (queue-first, EP fallback).
// Deduplicates via the draft_reminders table so each pick gets at most one reminder.
//
// Required Supabase secrets:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   APP_URL — your app's public URL, e.g. https://omnifantasy.app
//     Set via: supabase secrets set APP_URL=https://yourapp.com
//
// Deploy: supabase functions deploy check-timer-reminders

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getPickerIndex,
  normalizeDraftPicker,
  timerStringToMs,
  computeTimeRemaining,
  isInPauseWindow,
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

const ONE_HOUR_MS    = 60 * 60 * 1000;
const CRON_WINDOW_MS = 2 * 60 * 1000; // 2-min window for 1-min cron tick

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const appUrl = Deno.env.get('APP_URL') || '';

    // Load all active leagues that have timers
    const { data: leagues } = await admin
      .from('leagues')
      .select('id, name, draft_rounds, draft_timer, timer_pause_start_hour, timer_pause_end_hour, sports')
      .eq('draft_started', true)
      .not('draft_timer', 'eq', 'none')
      .not('draft_timer', 'is', null);

    if (!leagues?.length) return ok('no eligible leagues', 0);

    let sent = 0;

    for (const league of leagues) {
      const timerMs = timerStringToMs(league.draft_timer);
      if (!timerMs) continue;

      const { data: state } = await admin
        .from('draft_state')
        .select('current_pick, current_round, draft_order, is_snake, third_round_reversal, pick_started_at, draft_every_sport_required')
        .eq('league_id', league.id)
        .single();

      if (!state?.pick_started_at || !state.draft_order?.length) continue;

      const numMembers = state.draft_order.length;
      const maxPicks   = numMembers * (league.draft_rounds || 0);
      if (maxPicks > 0 && state.current_pick > maxPicks) continue; // draft complete

      const pauseStart = league.timer_pause_start_hour ?? 0;
      const pauseEnd   = league.timer_pause_end_hour   ?? 8;

      // Skip if currently inside the pause window (timer is frozen)
      if (isInPauseWindow(pauseStart, pauseEnd)) continue;

      const timeRemaining = computeTimeRemaining(
        state.pick_started_at, timerMs, pauseStart, pauseEnd,
      );

      // Auto-pick if the timer has expired (server-side fallback)
      if (timeRemaining <= 0) {
        const picked = await autoPickExpired(admin, league, state);
        if (picked) continue;
      }

      // Only leagues with timers longer than 1 hour can give a 1-hour warning
      if (timerMs <= ONE_HOUR_MS) continue;

      // Fire when timeRemaining is in the look-ahead window: [1h, 1h + cron_window].
      // This ensures the email arrives before (not after) the 1-hour mark, so the
      // subject "1 hour left" is accurate. The dedup table prevents double-sending.
      if (timeRemaining < ONE_HOUR_MS || timeRemaining > ONE_HOUR_MS + CRON_WINDOW_MS) continue;

      // Dedup: claim the slot atomically — PK conflict means another cron run already sent
      const { error: dedupError } = await admin.from('draft_reminders').insert({
        league_id:     league.id,
        pick_number:   state.current_pick,
        reminder_type: '1h',
      });
      if (dedupError) continue; // already sent

      // Find current picker
      const pickerIdx = getPickerIndex({
        currentPick:        state.current_pick,
        currentRound:       state.current_round,
        numMembers,
        isSnake:            state.is_snake ?? true,
        thirdRoundReversal: !!state.third_round_reversal,
      });
      const picker = normalizeDraftPicker(state.draft_order[pickerIdx]);
      if (!picker?.email) continue;

      // Check user preference
      const { data: wantsEmail } = await admin.rpc('get_user_otc_pref', { p_email: picker.email });
      if (!wantsEmail) continue;

      const minsLeft  = Math.max(1, Math.round(timeRemaining / 60_000));
      const timeStr   = minsLeft >= 60 ? '1 hour' : `${minsLeft} minutes`;
      const name      = picker.name || picker.email.split('@')[0];
      const draftUrl  = `${appUrl}?draft=${league.id}`;
      const subject   = `\u23F1 1 hour left to pick in ${league.name}`;
      const text = [
        `Hi ${name},`,
        ``,
        `You have about ${timeStr} left to make your pick in ${league.name} on Omnifantasy.`,
        `If the timer runs out, a pick will be made automatically for you.`,
        ``,
        `Draft now: ${draftUrl}`,
        ``,
        `Omnifantasy`,
      ].join('\n');
      const html = `
        <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
        <p>You have about <strong>${escapeHtml(timeStr)}</strong> left to make your pick in
           <strong>${escapeHtml(league.name)}</strong> on Omnifantasy.</p>
        <p style="color:#6b7280;">If the timer runs out, a pick will be made automatically for you.</p>
        <p>
          <a href="${escapeHtml(draftUrl)}"
             style="background:#dc2626;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0;font-weight:600;">
            Draft Now &#8594;
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">Or visit: ${escapeHtml(draftUrl)}</p>
      `;

      try {
        await sendEmail({ to: picker.email, subject, text, html });
        sent++;
      } catch (e) {
        console.error(`1h reminder failed for league ${league.id}:`, e);
      }
    }

    return ok('done', sent);
  } catch (err) {
    console.error('check-timer-reminders error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function ok(msg: string, sent: number) {
  return new Response(JSON.stringify({ success: true, msg, sent }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Server-side expiry auto-pick ───────────────────────────────────────────

async function autoPickExpired(
  admin: ReturnType<typeof createClient>,
  league: {
    id: string;
    name: string;
    draft_rounds: number | null;
    draft_timer: string | null;
    timer_pause_start_hour: number | null;
    timer_pause_end_hour: number | null;
    sports: string[];
  },
  state: {
    current_pick: number;
    current_round: number;
    draft_order: unknown[];
    is_snake: boolean | null;
    third_round_reversal: boolean | null;
    pick_started_at: string | null;
    draft_every_sport_required?: boolean | null;
  },
): Promise<boolean> {
  const leagueId = league.id;
  const currentPick = state.current_pick;
  const currentRound = state.current_round;
  const draftOrder = state.draft_order || [];
  if (!leagueId || !currentPick || draftOrder.length === 0) return false;

  const numMembers = draftOrder.length;
  const maxPicks = numMembers > 0 && (league.draft_rounds || 0) > 0
    ? numMembers * (league.draft_rounds || 0)
    : null;
  if (maxPicks && currentPick > maxPicks) return false; // draft complete

  const { data: picks } = await admin
    .from('draft_picks')
    .select('pick_number, sport, team_name, picker_email')
    .eq('league_id', leagueId);

  if ((picks || []).some(p => p.pick_number === currentPick)) return false;

  const pickerIdx = getPickerIndex({
    currentPick,
    currentRound,
    numMembers,
    isSnake: state.is_snake ?? true,
    thirdRoundReversal: !!state.third_round_reversal,
  });
  const picker = normalizeDraftPicker(draftOrder[pickerIdx]);
  if (!picker?.email) return false;

  const epMap = await fetchExpectedPoints(admin, league.sports || []);

  // Try queue first (even if auto-pick setting is off — matches client expiry behavior)
  const { data: queue } = await admin
    .from('draft_queue')
    .select('sport, team, position')
    .eq('league_id', leagueId)
    .eq('user_email', picker.email)
    .order('position', { ascending: true });

  const chosenFromQueue = getQueueAutopick(queue || [], picks || [], league, state, picker.email);
  let chosen = chosenFromQueue;
  if (!chosen) {
    const candidates = buildCandidates(picker.email, picks || [], league, state, epMap);
    if (candidates.length === 0) return false;
    const withEp = candidates.filter(c => c.ep != null);
    chosen = withEp.length > 0
      ? withEp.sort((a, b) => (b.ep ?? -Infinity) - (a.ep ?? -Infinity))[0]
      : candidates[0];
  }

  if (!chosen) return false;

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
    if (pickError.code === '23505') return false; // unique violation — picked elsewhere
    console.error('timer-expiry auto-pick: insert error', pickError);
    return false;
  }

  const nextPick = currentPick + 1;
  const nextRound = Math.ceil(nextPick / numMembers);
  const { error: stateError } = await admin.from('draft_state').update({
    current_pick: nextPick,
    current_round: nextRound,
    pick_started_at: new Date().toISOString(),
  }).eq('league_id', leagueId);

  if (stateError) console.error('timer-expiry auto-pick: state update error', stateError);

  try {
    await sendOtcEmailForNextPick(admin, league, state, nextPick, nextRound, numMembers);
  } catch (e) {
    console.warn('timer-expiry auto-pick: OTC email error', e);
  }

  console.log(`timer-expiry auto-pick: picked ${chosen.sport}/${chosen.team} for ${picker.email} (pick ${currentPick})`);
  return true;
}

// wouldBreakSportCoverage, buildCandidates, getQueueAutopick, fetchExpectedPoints
// are now imported from _shared/draft-helpers.ts

async function sendOtcEmailForNextPick(
  admin: ReturnType<typeof createClient>,
  league: { id: string; name: string; draft_timer: string | null },
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

  // Claim the dedup slot — prevents the auto-pick-from-queue webhook re-fire from
  // double-sending when draft_state advances to nextPick
  const { error: insertError } = await admin.from('draft_reminders').insert({
    league_id: league.id,
    pick_number: nextPick,
    reminder_type: 'otc',
  });
  if (insertError) return; // PK conflict = already sent

  const { data: wantsEmail } = await admin.rpc('get_user_otc_pref', { p_email: nextPicker.email });
  if (!wantsEmail) return;

  const appUrl = Deno.env.get('APP_URL') || '';
  const link   = appUrl ? `${appUrl}?draft=${league.id}` : '';
  const name   = nextPicker.name || nextPicker.email.split('@')[0];
  const subject = `You're on the clock in ${league.name}!`;
  const text = [
    `Hi ${name},`,
    ``,
    `It's your turn to draft in ${league.name} on Omnifantasy!`,
    ``,
    `Draft now: ${link}`,
    ``,
    `Omnifantasy`,
  ].join('\n');
  const html = `
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

  await sendEmail({ to: nextPicker.email, subject, text, html });
}
