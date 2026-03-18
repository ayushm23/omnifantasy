// Supabase Edge Function: send-otc-email
// Called fire-and-forget from the client after every pick (manual or auto).
// Emails the next picker when both the league and user have OTC emails enabled.
//
// Required Supabase secrets (shared with send-league-invite):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Deploy: supabase functions deploy send-otc-email

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getPickerIndex,
  normalizeDraftPicker,
  timerStringToMs,
  computeDeadline,
  sendEmail,
  escapeHtml,
} from '../_shared/draft-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { leagueId, appUrl } = await req.json();
    if (!leagueId) return skip('missing leagueId');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load league and draft state in parallel
    const [{ data: league }, { data: state }] = await Promise.all([
      admin
        .from('leagues')
        .select('name, draft_rounds, draft_timer, timer_pause_start_hour, timer_pause_end_hour')
        .eq('id', leagueId)
        .single(),
      admin
        .from('draft_state')
        .select('current_pick, current_round, draft_order, is_snake, third_round_reversal, pick_started_at')
        .eq('league_id', leagueId)
        .single(),
    ]);

    if (!league) return skip('league not found');
    if (!state?.draft_order?.length) return skip('no draft order');

    const numMembers = state.draft_order.length;
    const maxPicks   = numMembers * (league.draft_rounds || 0);
    if (maxPicks > 0 && state.current_pick > maxPicks) return skip('draft complete');

    // Determine who is now on the clock
    const pickerIdx = getPickerIndex({
      currentPick:      state.current_pick,
      currentRound:     state.current_round,
      numMembers,
      isSnake:          state.is_snake ?? true,
      thirdRoundReversal: !!state.third_round_reversal,
    });
    const picker = normalizeDraftPicker(state.draft_order[pickerIdx]);
    if (!picker?.email) return skip('picker email unknown');

    // Check user preference via SECURITY DEFINER RPC (reads auth.users)
    const { data: wantsEmail } = await admin.rpc('get_user_otc_pref', { p_email: picker.email });
    if (!wantsEmail) return skip('user OTC emails disabled');

    // Build timer deadline text if the league uses a pick timer
    const timerMs      = timerStringToMs(league.draft_timer);
    const pauseStart   = league.timer_pause_start_hour ?? 0;
    const pauseEnd     = league.timer_pause_end_hour   ?? 8;
    let deadlineText   = '';
    let deadlineHtml   = '';
    if (timerMs && state.pick_started_at) {
      const deadlineDate = computeDeadline(state.pick_started_at, timerMs, pauseStart, pauseEnd);
      const minsLeft = Math.max(1, Math.round((deadlineDate.getTime() - Date.now()) / 60_000));
      const timeStr  = minsLeft < 60
        ? `~${minsLeft} minutes`
        : minsLeft < 120 ? '~1 hour' : `~${Math.round(minsLeft / 60)} hours`;
      deadlineText = `\n\nPick expires in ${timeStr}.`;
      deadlineHtml = `<p style="color:#f59e0b;">&#9201; Pick expires in <strong>${timeStr}</strong>.</p>`;
    }

    const name    = picker.name || picker.email.split('@')[0];
    const link    = appUrl ? `${appUrl}?draft=${leagueId}` : '';
    const subject = `You're on the clock in ${league.name}!`;
    const text    = `Hi ${name},\n\nIt's your turn to draft in ${league.name} on Omnifantasy!${deadlineText}\n\nDraft now: ${link}\n\nOmnifantasy`;
    const html    = `
      <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
      <p>It's your turn to draft in <strong>${escapeHtml(league.name)}</strong> on Omnifantasy!</p>
      ${deadlineHtml}
      <p>
        <a href="${escapeHtml(link)}"
           style="background:#16a34a;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0;font-weight:600;">
          Draft Now &#8594;
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;">Or visit: ${escapeHtml(link)}</p>
    `;

    await sendEmail({ to: picker.email, subject, text, html });

    return new Response(JSON.stringify({ success: true, to: picker.email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-otc-email error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function skip(reason: string) {
  return new Response(JSON.stringify({ skipped: reason }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
