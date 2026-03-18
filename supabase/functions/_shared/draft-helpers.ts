// Shared helpers for OTC email Edge Functions.
// Used by: send-otc-email, check-timer-reminders

// ─── Draft logic (mirrors src/utils/draft.js) ────────────────────────────────

export function getPickerIndex({
  currentPick,
  currentRound,
  numMembers,
  isSnake,
  thirdRoundReversal,
}: {
  currentPick: number;
  currentRound: number;
  numMembers: number;
  isSnake: boolean;
  thirdRoundReversal: boolean;
}): number {
  if (!numMembers || currentPick < 1 || currentRound < 1) return 0;
  const pickInRound = (currentPick - 1) % numMembers;
  let isReversed = false;
  if (isSnake) {
    if (thirdRoundReversal) {
      if (currentRound === 2 || currentRound === 3) isReversed = true;
      else if (currentRound >= 4) isReversed = currentRound % 2 === 1;
    } else {
      isReversed = currentRound % 2 === 0;
    }
  }
  return isReversed ? numMembers - 1 - pickInRound : pickInRound;
}

export function normalizeDraftPicker(
  picker: unknown
): { email: string; name: string } | null {
  if (!picker) return null;
  if (typeof picker === 'string') {
    return { email: picker, name: picker.includes('@') ? picker.split('@')[0] : picker };
  }
  if (typeof picker === 'object' && picker !== null) {
    const p = picker as Record<string, unknown>;
    const email = (p.email as string) || '';
    const name = (p.name as string) || email.split('@')[0] || '';
    return { email, name };
  }
  return null;
}

// ─── Timer helpers ────────────────────────────────────────────────────────────

// Map draft_timer string ('4 hours', etc.) to milliseconds.
export function timerStringToMs(timerStr: string | null | undefined): number | null {
  if (!timerStr || timerStr === 'none') return null;
  const map: Record<string, number> = {
    '4 hours':  4  * 3600 * 1000,
    '8 hours':  8  * 3600 * 1000,
    '12 hours': 12 * 3600 * 1000,
    '24 hours': 24 * 3600 * 1000,
  };
  return map[timerStr] ?? null;
}

// Compute effective time remaining in ms, subtracting pause-window hours.
// pauseStartHour / pauseEndHour are integers 0–23 (interpreted in ET).
const TIMER_TIMEZONE = 'America/New_York';

const toTimeZoneMs = (ms: number, timeZone = TIMER_TIMEZONE) =>
  new Date(new Date(ms).toLocaleString('en-US', { timeZone })).getTime();

const getTimeZoneHour = (ms: number, timeZone = TIMER_TIMEZONE) =>
  new Date(new Date(ms).toLocaleString('en-US', { timeZone })).getHours();

export function isInPauseWindow(
  pauseStartHour: number,
  pauseEndHour: number,
  nowMs: number = Date.now(),
  timeZone: string = TIMER_TIMEZONE,
): boolean {
  if (pauseStartHour === pauseEndHour) return false;
  const hour = getTimeZoneHour(nowMs, timeZone);
  if (pauseStartHour < pauseEndHour) {
    return hour >= pauseStartHour && hour < pauseEndHour;
  }
  // Cross-midnight window, e.g. 22 -> 6
  return hour >= pauseStartHour || hour < pauseEndHour;
}

function getPausedElapsedMs(
  startMs: number,
  endMs: number,
  pauseStartHour: number,
  pauseEndHour: number,
  timeZone: string = TIMER_TIMEZONE,
): number {
  if (pauseStartHour === pauseEndHour || endMs <= startMs) return 0;

  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const startTz = toTimeZoneMs(startMs, timeZone);
  const endTz = toTimeZoneMs(endMs, timeZone);

  const overlapMs = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

  let pausedMs = 0;
  const dayCursor = new Date(startTz);
  dayCursor.setHours(0, 0, 0, 0);
  const endDay = new Date(endTz);
  endDay.setHours(0, 0, 0, 0);

  while (dayCursor.getTime() <= endDay.getTime()) {
    const dayStart = dayCursor.getTime();
    const dayEnd = dayStart + dayMs;

    if (pauseStartHour < pauseEndHour) {
      const pauseStart = dayStart + pauseStartHour * hourMs;
      const pauseEnd = dayStart + pauseEndHour * hourMs;
      pausedMs += overlapMs(startTz, endTz, pauseStart, pauseEnd);
    } else {
      const firstStart = dayStart;
      const firstEnd = dayStart + pauseEndHour * hourMs;
      const secondStart = dayStart + pauseStartHour * hourMs;
      pausedMs += overlapMs(startTz, endTz, firstStart, firstEnd);
      pausedMs += overlapMs(startTz, endTz, secondStart, dayEnd);
    }

    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return Math.max(0, pausedMs);
}

export function computeTimeRemaining(
  pickStartedAt: string,
  timerMs: number,
  pauseStartHour: number,
  pauseEndHour: number,
  nowMs: number = Date.now(),
): number {
  const startMs = new Date(pickStartedAt).getTime();
  const pauseAccumMs = getPausedElapsedMs(startMs, nowMs, pauseStartHour, pauseEndHour);
  const effectiveElapsed = (nowMs - startMs) - pauseAccumMs;
  return timerMs - effectiveElapsed;
}

// Given a pick start time and timer duration, compute the actual wall-clock
// deadline by advancing forward while skipping any configured pause windows.
// pauseStartHour / pauseEndHour are integers 0–23 (interpreted in ET).
export function computeDeadline(
  pickStartedAt: string,
  timerMs: number,
  pauseStartHour: number,
  pauseEndHour: number,
): Date {
  const start = new Date(pickStartedAt).getTime();

  // No pause window — simple addition
  if (pauseStartHour === pauseEndHour) {
    return new Date(start + timerMs);
  }

  // Iterate forward until the full active timer duration has elapsed,
  // using the same pause-window math as computeTimeRemaining.
  let cursor = start + timerMs;
  for (let i = 0; i < 12; i += 1) {
    const remaining = computeTimeRemaining(
      pickStartedAt,
      timerMs,
      pauseStartHour,
      pauseEndHour,
      cursor,
    );
    if (remaining <= 0) return new Date(cursor);
    cursor += remaining;
  }

  return new Date(cursor);
}

// ─── Auto-pick helpers (shared by auto-pick-from-queue and check-timer-reminders) ──

import { getTeamPoolForSport } from './team-pools.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

export function wouldBreakSportCoverage({
  sportRequirementEnabled,
  leagueSports,
  pool,
  draftEmails,
  picks,
  pickerEmail,
  sport,
  team,
}: {
  sportRequirementEnabled: boolean;
  leagueSports: string[];
  pool: string[];
  draftEmails: string[];
  picks: Array<{ sport: string; team_name: string; picker_email: string }>;
  pickerEmail: string;
  sport: string;
  team: string;
}): boolean {
  if (!sportRequirementEnabled) return false;
  if (!(leagueSports || []).includes(sport)) return false;
  const pickerEmailLower = pickerEmail?.toLowerCase();
  if (!pickerEmailLower) return false;
  if (!draftEmails || draftEmails.length === 0) return false;
  if (!pool || pool.length === 0) return false;

  const pickedInSport = new Set(
    (picks || []).filter(p => p.sport === sport).map(p => p.team_name)
  );
  let remainingAfterPick = pool.filter(teamName => !pickedInSport.has(teamName)).length;
  if (!pickedInSport.has(team)) {
    remainingAfterPick = Math.max(0, remainingAfterPick - 1);
  }

  let membersStillNeedingSportAfterPick = 0;
  for (const email of draftEmails) {
    const alreadyHasSport = (picks || []).some(
      p => p.picker_email?.toLowerCase() === email && p.sport === sport
    );
    const hasSportAfterPick = alreadyHasSport || email === pickerEmailLower;
    if (!hasSportAfterPick) membersStillNeedingSportAfterPick += 1;
  }

  return remainingAfterPick < membersStillNeedingSportAfterPick;
}

export function buildCandidates(
  pickerEmail: string,
  picks: Array<{ sport: string; team_name: string; picker_email: string }>,
  league: { sports: string[]; draft_rounds?: number },
  draftState: { draft_every_sport_required?: boolean; draft_order?: unknown[] },
  epMap: Record<string, Record<string, number>>,
) {
  const pickerEmailLower = pickerEmail.toLowerCase();
  const pickerPicks = (picks || []).filter(
    p => p.picker_email?.toLowerCase() === pickerEmailLower
  );
  const sportRequirementEnabled = draftState?.draft_every_sport_required !== false;
  const missingRequiredSports = (league?.sports || []).filter(
    sport => !pickerPicks.some(p => p.sport === sport)
  );
  const candidateSports = (sportRequirementEnabled && missingRequiredSports.length > 0)
    ? missingRequiredSports
    : (league?.sports || []);

  // Mirror DraftView's isPickerSportFull: skip sports the picker already has when no flex picks remain.
  const draftRounds = league?.draft_rounds || 0;
  const pickerFlexRemaining = Math.max(
    0,
    draftRounds - pickerPicks.length - (sportRequirementEnabled ? missingRequiredSports.length : 0),
  );
  const pickerCoveredSports = new Set(pickerPicks.map(p => p.sport));

  const draftEmails = (draftState.draft_order || [])
    .map(m => normalizeDraftPicker(m)?.email?.toLowerCase())
    .filter(Boolean) as string[];

  const pickedSet = new Set((picks || []).map(p => `${p.sport}::${p.team_name}`));
  const candidates: Array<{ sport: string; team: string; ep: number | null }> = [];
  for (const sport of candidateSports) {
    if (pickerFlexRemaining <= 0 && pickerCoveredSports.has(sport)) continue;
    const teams = getTeamPoolForSport(sport);
    for (const team of teams) {
      if (pickedSet.has(`${sport}::${team}`)) continue;
      if (wouldBreakSportCoverage({
        sportRequirementEnabled,
        leagueSports: league?.sports || [],
        pool: teams,
        draftEmails,
        picks,
        pickerEmail,
        sport,
        team,
      })) continue;
      candidates.push({ sport, team, ep: epMap?.[sport]?.[team] ?? null });
    }
  }
  return candidates;
}

export function getQueueAutopick(
  queue: Array<{ sport: string; team: string }>,
  picks: Array<{ sport: string; team_name: string; picker_email: string }>,
  league: { sports: string[]; draft_rounds?: number },
  draftState: { draft_every_sport_required?: boolean; draft_order?: unknown[] },
  pickerEmail: string,
): { sport: string; team: string } | null {
  if (!queue || queue.length === 0) return null;
  const pickedSet = new Set((picks || []).map(p => `${p.sport}::${p.team_name}`));

  // Mirror DraftView's isPickerSportFull: skip sports the picker already has when no flex picks remain.
  const pickerPicks = (picks || []).filter(p => p.picker_email?.toLowerCase() === pickerEmail.toLowerCase());
  const sportRequirementEnabled = draftState?.draft_every_sport_required !== false;
  const missingRequiredSports = (league?.sports || []).filter(
    s => !pickerPicks.some(p => p.sport === s),
  );
  const draftRounds = league?.draft_rounds || 0;
  const pickerFlexRemaining = Math.max(
    0,
    draftRounds - pickerPicks.length - (sportRequirementEnabled ? missingRequiredSports.length : 0),
  );
  const pickerCoveredSports = new Set(pickerPicks.map(p => p.sport));

  for (const item of queue) {
    if (pickedSet.has(`${item.sport}::${item.team}`)) continue;
    if (pickerFlexRemaining <= 0 && pickerCoveredSports.has(item.sport)) continue;
    const pool = getTeamPoolForSport(item.sport);
    if (!pool || pool.length === 0) continue;
    if (wouldBreakSportCoverage({
      sportRequirementEnabled,
      leagueSports: league?.sports || [],
      pool,
      draftEmails: (draftState.draft_order || [])
        .map(m => normalizeDraftPicker(m)?.email?.toLowerCase())
        .filter(Boolean) as string[],
      picks,
      pickerEmail,
      sport: item.sport,
      team: item.team,
    })) continue;
    return { sport: item.sport, team: item.team };
  }
  return null;
}

export async function fetchExpectedPoints(
  admin: ReturnType<typeof createClient>,
  sports: string[],
): Promise<Record<string, Record<string, number>>> {
  if (!sports.length) return {};
  const { data } = await admin
    .from('odds_cache')
    .select('sport_code, data')
    .in('sport_code', sports);

  const epMap: Record<string, Record<string, number>> = {};
  for (const row of data || []) {
    const raw = row.data || {};
    const { _v, ...teams } = raw;
    epMap[row.sport_code] = teams as Record<string, number>;
  }
  return epMap;
}

// ─── Email ────────────────────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const host = Deno.env.get('SMTP_HOST')!;
  const port = parseInt(Deno.env.get('SMTP_PORT') || '587');
  const user = Deno.env.get('SMTP_USER')!;
  const pass = Deno.env.get('SMTP_PASS')!;
  const from = Deno.env.get('SMTP_FROM') || user;

  const nodemailer = await import('npm:nodemailer@6');
  const transporter = nodemailer.default.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"Omnifantasy" <${from}>`,
    to,
    subject,
    text,
    html,
  });
}
