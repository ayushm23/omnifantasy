// multiEventScoring.js
// Single source of truth for Golf / Tennis per-event scoring helpers.
// Used by both resultsApi.js and points.js.
//
// Per-event internal scoring (used to rank players across majors):
//   Champion:         8 pts
//   Runner-up:        5 pts
//   Semifinalist:     3 pts
//   Quarterfinalist:  2 pts
//   T9–T16 (Golf):    1 pt
//   R16 loser (Tennis): 1 pt
//
// Final Omnifantasy points (80/50/30/20) are awarded once based on the
// overall rankings[] array computed by computeMultiEventRankings.

/**
 * Points earned by a player in a single Golf event.
 */
export function golfEventPoints(player, event) {
  if (!event?.is_complete) return 0;
  if (player === event.champion) return 8;
  if (player === event.runner_up) return 5;
  if (event.semifinals?.includes(player)) return 3;
  if (event.quarterfinalists?.includes(player)) return 2;
  if (event.ninth_to_sixteenth?.includes(player)) return 1;
  return 0;
}

/**
 * Points earned by a player in a single Tennis event.
 */
export function tennisEventPoints(player, event) {
  if (!event?.is_complete) return 0;
  if (player === event.champion) return 8;
  if (player === event.runner_up) return 5;
  if (event.semifinals?.includes(player)) return 3;
  if (event.quarterfinalists?.includes(player)) return 2;
  if (event.round_of_sixteen?.includes(player)) return 1;
  return 0;
}

/**
 * Build an ordered rankings array from completed multi-event results.
 * Players are sorted by total accumulated points (desc), tiebroken by best
 * single-event score (desc). Only players who scored ≥1 point are included.
 *
 * @param {Array} events - array of event result objects
 * @param {Function} getEventPointsFn - golfEventPoints or tennisEventPoints
 * @returns {string[]} player names ordered from most to fewest accumulated points
 */
export function computeMultiEventRankings(events, getEventPointsFn) {
  const completedEvents = events.filter(e => e.is_complete);
  if (completedEvents.length === 0) return [];

  const playerSet = new Set();
  for (const event of completedEvents) {
    [
      event.champion,
      event.runner_up,
      ...(event.semifinals || []),
      ...(event.quarterfinalists || []),
      ...(event.ninth_to_sixteenth || []),
      ...(event.round_of_sixteen || []),
    ].filter(Boolean).forEach(p => playerSet.add(p));
  }

  const playerData = [];
  for (const player of playerSet) {
    const pts = completedEvents.map(e => getEventPointsFn(player, e));
    const total = pts.reduce((a, b) => a + b, 0);
    const best = Math.max(...pts, 0);
    if (total > 0) playerData.push({ player, total, best });
  }

  playerData.sort((a, b) => b.total - a.total || b.best - a.best);
  return playerData.map(d => d.player);
}
