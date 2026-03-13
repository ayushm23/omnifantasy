// Supabase Edge Function: check-timer-reminders
// Cron job — runs every 15 minutes via pg_cron (see database-migration-draft-reminders.sql).
// Sends a "1 hour left" reminder email to any picker whose timer is within 1 hour of expiring.
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
  sendEmail,
  escapeHtml,
} from '../_shared/draft-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ONE_HOUR_MS    = 60 * 60 * 1000;
const CRON_WINDOW_MS = 16 * 60 * 1000; // 16-min window catches every 15-min cron tick

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
      .select('id, name, draft_rounds, draft_timer, timer_pause_start_hour, timer_pause_end_hour')
      .eq('draft_started', true)
      .not('draft_timer', 'eq', 'none')
      .not('draft_timer', 'is', null);

    if (!leagues?.length) return ok('no eligible leagues', 0);

    let sent = 0;

    for (const league of leagues) {
      const timerMs = timerStringToMs(league.draft_timer);
      // Only leagues with timers longer than 1 hour can give a 1-hour warning
      if (!timerMs || timerMs <= ONE_HOUR_MS) continue;

      const { data: state } = await admin
        .from('draft_state')
        .select('current_pick, current_round, draft_order, is_snake, third_round_reversal, pick_started_at')
        .eq('league_id', league.id)
        .single();

      if (!state?.pick_started_at || !state.draft_order?.length) continue;

      const numMembers = state.draft_order.length;
      const maxPicks   = numMembers * (league.draft_rounds || 0);
      if (maxPicks > 0 && state.current_pick > maxPicks) continue; // draft complete

      const pauseStart = league.timer_pause_start_hour ?? 0;
      const pauseEnd   = league.timer_pause_end_hour   ?? 8;

      // Skip if currently inside the pause window (timer is frozen)
      const nowHour = new Date().getUTCHours();
      if (pauseStart < pauseEnd && nowHour >= pauseStart && nowHour < pauseEnd) continue;

      const timeRemaining = computeTimeRemaining(
        state.pick_started_at, timerMs, pauseStart, pauseEnd,
      );

      // Fire when timeRemaining is in the look-ahead window: [1h, 1h + cron_window].
      // This ensures the email arrives before (not after) the 1-hour mark, so the
      // subject "1 hour left" is accurate. The dedup table prevents double-sending.
      if (timeRemaining < ONE_HOUR_MS || timeRemaining > ONE_HOUR_MS + CRON_WINDOW_MS) continue;

      // Dedup: skip if we already sent a 1h reminder for this pick
      const { data: existing } = await admin
        .from('draft_reminders')
        .select('pick_number')
        .eq('league_id', league.id)
        .eq('pick_number', state.current_pick)
        .eq('reminder_type', '1h')
        .maybeSingle();

      if (existing) continue;

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
        await admin.from('draft_reminders').insert({
          league_id:     league.id,
          pick_number:   state.current_pick,
          reminder_type: '1h',
        });
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
