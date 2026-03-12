// Data fetcher for sports not covered by The Odds API
// Currently handles: F1
//
// F1: Fetches live driver standings from the Jolpica API (free, CORS-friendly)
//     and converts championship points to win probabilities via softmax.
//     During off-season or early season, uses preseason market-derived odds.
//
// Tennis (ATP/WTA) and Golf are handled via SPORT_KEY_MAP in oddsApi.js.
//
// All results are cached in the same odds_cache table with the same 2-day TTL.

import { normalizeF1Name } from './utils/aliases';

const JOLPICA_F1_STANDINGS = 'https://api.jolpi.ca/ergast/f1/current/driverStandings.json';

// -----------------------------------------------------------------
// Market-derived preseason odds (implied probabilities)
// Source: Aggregated from major sportsbooks' 2026 preseason futures.
// Update these at the start of each season for accuracy.
// -----------------------------------------------------------------

// F1 2026 World Championship — preseason implied probabilities
// Used as fallback during off-season or early season (<25 pts)
const F1_PRESEASON_ODDS = {
  'Max Verstappen': 0.22,
  'Lando Norris': 0.18,
  'Charles Leclerc': 0.14,
  'Oscar Piastri': 0.10,
  'George Russell': 0.07,
  'Lewis Hamilton': 0.06,
  'Carlos Sainz': 0.05,
  'Kimi Antonelli': 0.04,
  'Fernando Alonso': 0.03,
  'Pierre Gasly': 0.02,
  'Alex Albon': 0.02,
  'Yuki Tsunoda': 0.015,
  'Nico Hulkenberg': 0.01,
  'Oliver Bearman': 0.01,
  'Esteban Ocon': 0.008,
  'Lance Stroll': 0.005,
  'Jack Doohan': 0.004,
  'Isack Hadjar': 0.004,
  'Gabriel Bortoleto': 0.004,
  'Liam Lawson': 0.003,
};

const SCRAPED_SPORT_CODES = ['F1'];

/**
 * Normalize a preseason odds map so probabilities sum to exactly 1.0.
 * Handles rounding errors from the manually entered values.
 */
function normalizeOdds(oddsMap) {
  const total = Object.values(oddsMap).reduce((a, b) => a + b, 0);
  if (total === 0) return oddsMap;
  const result = {};
  for (const [name, prob] of Object.entries(oddsMap)) {
    result[name] = prob / total;
  }
  return result;
}

/**
 * Fetch F1 championship probabilities from the Jolpica API.
 * Converts driver standings points to win probabilities using softmax.
 * Falls back to preseason market-derived odds during off-season.
 */
async function fetchF1Probabilities() {
  try {
    const response = await fetch(JOLPICA_F1_STANDINGS);
    if (!response.ok) throw new Error(`Jolpica API returned ${response.status}`);

    const data = await response.json();
    const standingsList = data?.MRData?.StandingsTable?.StandingsLists;
    const standings = standingsList?.[0]?.DriverStandings;

    if (!standings || standings.length === 0) {
      // Off-season — use preseason market odds
      return normalizeOdds(F1_PRESEASON_ODDS);
    }

    // Extract points for softmax calculation
    const drivers = standings.map(s => ({
      name: normalizeF1Name(`${s.Driver.givenName} ${s.Driver.familyName}`),
      points: parseFloat(s.points) || 0,
    }));

    const maxPoints = Math.max(...drivers.map(d => d.points));

    // Early season with very few points — softmax isn't meaningful yet
    if (maxPoints < 25) {
      return normalizeOdds(F1_PRESEASON_ODDS);
    }

    // Softmax: P(i) = exp(pts_i / temp) / Σ exp(pts_j / temp)
    // Temperature controls spread — lower = more concentrated on leader
    const temp = maxPoints * 0.3;
    const expScores = drivers.map(d => Math.exp(d.points / temp));
    const totalExp = expScores.reduce((a, b) => a + b, 0);

    const result = {};
    drivers.forEach((d, i) => {
      result[d.name] = expScores[i] / totalExp;
    });

    return result;
  } catch {
    // API error — fall back to preseason market odds
    return normalizeOdds(F1_PRESEASON_ODDS);
  }
}

/**
 * Fetch scraped probabilities for a given sport code.
 * Returns { playerName: winProbability } or {} if sport not supported.
 */
export async function fetchScrapedProbabilities(sportCode) {
  switch (sportCode) {
    case 'F1':
      return fetchF1Probabilities();
    default:
      return {};
  }
}

/**
 * Check if a sport code is handled by the scraper
 */
export function isScrapedSport(sportCode) {
  return SCRAPED_SPORT_CODES.includes(sportCode);
}
