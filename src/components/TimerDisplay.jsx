import React from 'react';
import { formatHourLabel, formatTimeRemaining } from '../utils/format';

/**
 * Unified draft-timer display component.
 *
 * Props:
 *   timeRemaining  — milliseconds remaining on current pick (or null if not loaded)
 *   isPaused       — whether the timer is currently in the overnight pause window
 *   pauseEndHour   — 24-hour integer when the pause window ends (default 8 → 8:00 AM)
 *   compact        — true: renders as inline <span> (for headers)
 *                    false (default): renders as a block card (for DraftView main timer)
 *
 * Paused state always shows the resume time, never a running countdown.
 * Active state is color-coded: red+pulse <60s, yellow <5m, blue/green ≥5m.
 */
const TimerDisplay = ({ timeRemaining, isPaused, pauseEndHour = 8, compact = false }) => {
  if (compact) {
    if (isPaused) {
      return (
        <span className="text-slate-400 font-normal text-xs">
          ⏸ Paused · Resumes {formatHourLabel(pauseEndHour)} ET
        </span>
      );
    }
    if (timeRemaining === null) return null;
    const label = formatTimeRemaining(timeRemaining);
    if (!label) return null;
    return (
      <span className={`font-bold ${
        timeRemaining < 60000 ? 'text-red-400 animate-pulse' :
        timeRemaining < 300000 ? 'text-yellow-400' :
        'text-green-300'
      }`}>
        {label}
      </span>
    );
  }

  // Full block display (DraftView main timer section)
  if (isPaused) {
    return (
      <div className="mt-2 flex flex-col gap-0.5">
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-700/60 border border-slate-600/60 text-slate-300 text-sm font-semibold">
          ⏸ Timer paused
        </div>
        <div className="text-xs text-slate-500">
          Resumes {formatHourLabel(pauseEndHour)} ET
        </div>
      </div>
    );
  }

  if (timeRemaining === null) return null;
  const label = formatTimeRemaining(timeRemaining);
  if (!label) return null;
  return (
    <div className={`text-lg font-bold mt-2 ${
      timeRemaining < 60000 ? 'text-red-400 animate-pulse' :
      timeRemaining < 300000 ? 'text-yellow-400' :
      'text-blue-400'
    }`}>
      {label}
    </div>
  );
};

export default TimerDisplay;
