// Pure point-calculation utilities — no API calls, no side effects.
//
// Scoring system:
//   Champion:          80 pts
//   Runner-up:         50 pts
//   Semifinalist (×2): 30 pts each
//   Quarterfinalist(×4):20 pts each
//
// resultsMap shape (keyed by sport code):
//   Single-event:  { champion, runner_up, semifinals[], quarterfinalists[], is_complete, season }
//   Multi-event (Golf/Tennis): { events: [{ name, champion, runner_up, semifinals[], quarterfinalists[], is_complete }], is_complete, season }
//   F1:            { standings: [ordered driver names], is_complete, season }

// ─── Multi-event sport helpers ───────────────────────────────────────────────
// Imported from src/utils/multiEventScoring.js — single source of truth.
import { golfEventPoints, tennisEventPoints, computeMultiEventRankings } from './multiEventScoring';

const MULTI_EVENT_SPORTS = new Set(['Golf', 'MensTennis', 'WomensTennis']);

/**
 * For in-progress Golf/Tennis sports, returns the accumulated internal event
 * points (8/5/3/2/1 per event) across all completed events.
 *
 * Returns null when:
 *   - sport is not Golf/Tennis
 *   - sport results are absent
 *   - sport is already complete (use calculatePickPoints for final Omnifantasy pts)
 *   - no events have finished yet
 *
 * Returns { accumulated: number, eventsComplete: number, eventsTotal: number }
 * when ≥1 event is done but the overall season is not yet complete.
 */
export function getPartialMultiEventPoints(pick, resultsMap) {
  const sport = pick.sport;
  if (!MULTI_EVENT_SPORTS.has(sport)) return null;
  const results = resultsMap?.[sport];
  if (!results || results.is_complete) return null; // not applicable or already final

  const events = results.events || [];
  const eventsTotal = events.length;
  const completedEvents = events.filter(e => e.is_complete);
  if (completedEvents.length === 0) return null;

  const team = pick.team_name || pick.team;
  const getEventPts = sport === 'Golf' ? golfEventPoints : tennisEventPoints;
  const accumulated = completedEvents.reduce((sum, evt) => sum + getEventPts(team, evt), 0);

  return { accumulated, eventsComplete: completedEvents.length, eventsTotal };
}

/**
 * Returns the points awarded to a single pick given the results map.
 * Returns null if the sport is not yet complete (so callers can show "TBD").
 * Returns 0 if complete but the pick didn't reach a scoring position.
 */
export function calculatePickPoints(pick, resultsMap) {
  const results = resultsMap?.[pick.sport];
  if (!results?.is_complete) return null;

  const team = pick.team_name || pick.team;

  if (pick.sport === 'F1') {
    const pos = Array.isArray(results.standings) ? results.standings.indexOf(team) : -1;
    if (pos === 0) return 80;
    if (pos === 1) return 50;
    if (pos === 2 || pos === 3) return 30;
    if (pos >= 4 && pos <= 7) return 20;
    return 0;
  }

  if (pick.sport === 'Golf' || pick.sport === 'MensTennis' || pick.sport === 'WomensTennis') {
    // New system: Omnifantasy 80/50/30/20 awarded once based on accumulated
    // golf/tennis points ranking across all 4 majors.
    if (results.rankings) {
      const pos = results.rankings.indexOf(team);
      if (pos < 0) return 0;
      if (pos === 0) return 80;
      if (pos === 1) return 50;
      if (pos === 2 || pos === 3) return 30;
      if (pos >= 4 && pos <= 7) return 20;
      return 0;
    }
    // Fallback for old cache entries without rankings (pre-v2 format)
    return (results.events || []).reduce((sum, event) => {
      return sum + getSingleEventPoints(team, event);
    }, 0);
  }

  return getSingleEventPoints(team, results);
}

/**
 * Points for a single tournament event.
 * @param {string} teamName
 * @param {{ champion, runner_up, semifinals, quarterfinalists, is_complete }} eventResult
 */
function getSingleEventPoints(teamName, eventResult) {
  if (!eventResult?.is_complete) return 0;
  if (teamName === eventResult.champion) return 80;
  if (teamName === eventResult.runner_up) return 50;
  if (Array.isArray(eventResult.semifinals) && eventResult.semifinals.includes(teamName)) return 30;
  if (Array.isArray(eventResult.quarterfinalists) && eventResult.quarterfinalists.includes(teamName)) return 20;
  return 0;
}

/**
 * Filter multi-event (Golf/Tennis) results to only include events that
 * started on or after the league's draft date.
 *
 * The 4 events that count for a league are the 4 that take place AFTER the draft
 * starts — not necessarily the 4 in a fixed calendar year. Events with
 * approxMonth/year metadata that predate draftDate are excluded from scoring.
 *
 * Note: Events without date metadata (legacy cache entries) are always included.
 * Cross-year scenarios (where needed events span two calendar years) are handled
 * naturally: the missing events will show is_complete=false until they occur.
 *
 * @param {{ [sportCode]: object }} results - The raw results map from useResults()
 * @param {string|null} draftDate - League draft date string (e.g. "Mar 3, 2026")
 * @returns {{ [sportCode]: object }} - Filtered results map safe to pass to calculatePickPoints
 */
export function filterResultsForLeague(results, draftDate) {
  if (!draftDate || !results) return results;
  const draft = new Date(draftDate);
  if (isNaN(draft.getTime())) return results;
  // Normalize draft to UTC midnight to avoid timezone offsets when comparing
  // against event months (which are also expressed as UTC midnight via Date.UTC).
  const draftUtcMs = Date.UTC(draft.getUTCFullYear(), draft.getUTCMonth(), draft.getUTCDate());

  const filtered = {};
  for (const [sport, sportResult] of Object.entries(results)) {
    if (!sportResult?.events) {
      // Single-event (NFL, NBA, etc.) or F1 — no per-event filtering needed
      filtered[sport] = sportResult;
      continue;
    }

    // Multi-event: keep only events that start on or after the draft date.
    // Use Date.UTC for both sides so timezone offsets don't shift the comparison.
    const relevantEvents = sportResult.events.filter(evt => {
      if (!evt.year || !evt.approxMonth) return true; // no metadata → include
      const evtStartMs = Date.UTC(evt.year, evt.approxMonth - 1, 1); // 1st of the month, UTC
      return evtStartMs >= draftUtcMs;
    });

    // Recompute rankings from the filtered events so scoring reflects only
    // the events that count for this league's draft date.
    const getEventPointsFn = sport === 'Golf' ? golfEventPoints : tennisEventPoints;
    const rankings = computeMultiEventRankings(relevantEvents, getEventPointsFn);

    filtered[sport] = {
      ...sportResult,
      events: relevantEvents,
      rankings,
      // is_complete only when all relevant events have finished
      is_complete: relevantEvents.length > 0 && relevantEvents.every(e => e.is_complete),
    };
  }
  return filtered;
}

/**
 * Build standings rows from members, picks, and results.
 * Returns array sorted descending by totalPoints, with rank assigned.
 *
 * @param {object} previousRankMap - { [email]: previousRank } snapshot from localStorage
 */
export function computeStandingsFromPicks(membersList, picks, resultsMap, currentUserEmail, previousRankMap = {}) {
  const memberPoints = {};
  const memberStats = {};

  for (const member of membersList) {
    memberPoints[member.email] = 0;
    memberStats[member.email] = { champions: 0, runnerups: 0, semifinals: 0, quarterfinals: 0 };
  }

  for (const pick of picks) {
    const pts = calculatePickPoints(pick, resultsMap);
    if (pts > 0 && memberPoints[pick.picker_email] !== undefined) {
      memberPoints[pick.picker_email] += pts;
      const stats = memberStats[pick.picker_email];
      if (pts === 80) stats.champions++;
      else if (pts === 50) stats.runnerups++;
      else if (pts === 30) stats.semifinals++;
      else if (pts === 20) stats.quarterfinals++;
    }
  }

  const rows = membersList.map((member, index) => ({
    rank: index + 1,
    previousRank: previousRankMap[member.email] ?? (index + 1),
    teamName: member.name || member.email?.split('@')[0] || `Team ${index + 1}`,
    owner: member.email,
    email: member.email,
    hasAccount: true,
    isCommissioner: false,
    isUser: member.email.toLowerCase() === currentUserEmail?.toLowerCase(),
    totalPoints: memberPoints[member.email] || 0,
    ...(memberStats[member.email] || {}),
  }));

  rows.sort((a, b) => b.totalPoints - a.totalPoints);
  // Competition ranking (1, 2, 2, 4): tied members share the same rank;
  // the next rank skips as many positions as there were ties.
  rows.forEach((row, i) => {
    if (i === 0 || row.totalPoints !== rows[i - 1].totalPoints) {
      row.rank = i + 1;
    } else {
      row.rank = rows[i - 1].rank;
    }
  });
  return rows;
}
