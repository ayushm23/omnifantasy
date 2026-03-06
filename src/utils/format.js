/**
 * Formats a 24-hour clock hour to a 12-hour AM/PM label.
 * e.g. 0 → "12:00 AM", 13 → "1:00 PM"
 */
export const formatHourLabel = (hour) => {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const hour12 = normalized % 12 || 12;
  return `${hour12}:00 ${suffix}`;
};

/**
 * Formats milliseconds into a human-readable countdown string.
 * e.g. 7384000 → "2h 3m 4s", 184000 → "3m 4s", 4000 → "4s"
 * Returns null if ms is null or 0.
 */
export const formatTimeRemaining = (ms) => {
  if (ms === null || ms === 0) return null;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};
