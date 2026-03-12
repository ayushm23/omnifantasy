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
// pauseStartHour / pauseEndHour are integers 0–23 (UTC-based league setting).
export function computeTimeRemaining(
  pickStartedAt: string,
  timerMs: number,
  pauseStartHour: number,
  pauseEndHour: number,
): number {
  const now = Date.now();
  const startMs = new Date(pickStartedAt).getTime();

  let pauseAccumMs = 0;
  if (pauseStartHour < pauseEndHour) {
    // Walk day-by-day from pick start to now, accumulating pause overlap.
    const dayMs = 24 * 3600 * 1000;
    let cursor = startMs;
    while (cursor < now) {
      const dayStart = cursor - (cursor % dayMs); // UTC midnight
      const winStart = dayStart + pauseStartHour * 3600 * 1000;
      const winEnd   = dayStart + pauseEndHour   * 3600 * 1000;
      const overlapStart = Math.max(cursor, winStart);
      const overlapEnd   = Math.min(now,    winEnd);
      if (overlapEnd > overlapStart) pauseAccumMs += overlapEnd - overlapStart;
      cursor = dayStart + dayMs;
    }
  }

  const effectiveElapsed = (now - startMs) - pauseAccumMs;
  return timerMs - effectiveElapsed;
}

// Given a pick start time and timer duration, compute the actual wall-clock
// deadline by advancing forward while skipping any configured pause windows.
// pauseStartHour / pauseEndHour are integers 0–23 (UTC-based).
export function computeDeadline(
  pickStartedAt: string,
  timerMs: number,
  pauseStartHour: number,
  pauseEndHour: number,
): Date {
  const start = new Date(pickStartedAt).getTime();

  // No effective pause window — simple addition
  if (pauseStartHour >= pauseEndHour) {
    return new Date(start + timerMs);
  }

  const dayMs          = 24 * 3600 * 1000;
  const pauseDurMs     = (pauseEndHour - pauseStartHour) * 3600 * 1000;
  let cursor           = start;
  let remainingActive  = timerMs;

  while (remainingActive > 0) {
    const dayStart  = cursor - (cursor % dayMs); // UTC midnight of cursor's day
    const winStart  = dayStart + pauseStartHour * 3600 * 1000;
    const winEnd    = dayStart + pauseEndHour   * 3600 * 1000;

    // If cursor landed inside a pause window, jump to end of it
    if (cursor >= winStart && cursor < winEnd) {
      cursor = winEnd;
      continue;
    }

    // Next pause start (today's if we haven't reached it yet, otherwise tomorrow's)
    const nextPause = cursor < winStart ? winStart : winStart + dayMs;
    const activeUntilPause = nextPause - cursor;

    if (remainingActive <= activeUntilPause) {
      cursor += remainingActive;
      remainingActive = 0;
    } else {
      remainingActive -= activeUntilPause;
      cursor = nextPause + pauseDurMs; // skip the pause window
    }
  }

  return new Date(cursor);
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
