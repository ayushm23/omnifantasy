import { computeStandingsFromPicks } from './points';

/**
 * Generate standings rows for a league.
 *
 * @param {object} league            - League object from useLeagues (includes membersList, commissionerEmail)
 * @param {Array}  picks             - Raw draft picks from useDraft (snake_case fields from Supabase)
 * @param {string} currentUserEmail
 * @param {object} results           - Results map from useResults: { [sportCode]: resultObject }
 * @param {object} previousRankMap   - { [email]: previousRank } snapshot from localStorage
 * @returns {Array} Standings rows sorted descending by totalPoints, with rank assigned.
 */
export const generateStandings = (league, picks, currentUserEmail, results = {}, previousRankMap = {}) => {
  if (!league?.membersList) return [];

  const rows = computeStandingsFromPicks(
    league.membersList,
    picks || [],
    results,
    currentUserEmail,
    previousRankMap,
  );

  // Mark commissioner
  rows.forEach(row => {
    row.isCommissioner = league.commissionerEmail?.toLowerCase() === row.email.toLowerCase();
  });

  return rows;
};
