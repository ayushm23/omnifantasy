// epCalc.js
// Single source of truth for the EP (Expected Points) formula.
// Used by both oddsApi.js and oddsScraper.js.
//
// EP Positional Probability Model:
//   Given win probability p:
//   P(top 2) ≈ min(1, 2p), P(top 4) ≈ min(1, 4p), P(top 8) ≈ min(1, 12p)
//   EP = P(champ)×80 + P(runner-up)×50 + P(semi)×30 + P(quarter)×20

const CHAMPION_PTS      = 80;
const RUNNER_UP_PTS     = 50;
const SEMIFINALIST_PTS  = 30;
const QUARTERFINALIST_PTS = 20;

/**
 * Calculate expected points from a win probability.
 * @param {number} winProbability — a value in [0, 1]
 * @returns {number} expected points
 */
export function calculateEP(winProbability) {
  const p = winProbability;
  const pTop2 = Math.min(1, 2 * p);
  const pTop4 = Math.min(1, 4 * p);
  const pTop8 = Math.min(1, 12 * p);

  const pChampion      = p;
  const pRunnerUp      = pTop2 - p;
  const pSemifinalist  = pTop4 - pTop2;
  const pQuarterfinalist = pTop8 - pTop4;

  return pChampion      * CHAMPION_PTS
       + pRunnerUp      * RUNNER_UP_PTS
       + pSemifinalist  * SEMIFINALIST_PTS
       + pQuarterfinalist * QUARTERFINALIST_PTS;
}
