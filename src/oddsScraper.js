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

// ATP 2026 Grand Slam aggregate — preseason implied win probabilities.
// Used as last-resort fallback when all 4 slam markets are dark AND no stale cache exists
// (e.g. Oct–Nov off-season, or after cache is manually cleared mid-dead-zone).
const ATP_PRESEASON_ODDS = {
  'Jannik Sinner': 0.16,
  'Carlos Alcaraz': 0.15,
  'Novak Djokovic': 0.08,
  'Alexander Zverev': 0.07,
  'Daniil Medvedev': 0.06,
  'Taylor Fritz': 0.04,
  'Casper Ruud': 0.035,
  'Holger Rune': 0.03,
  'Alex de Minaur': 0.025,
  'Stefanos Tsitsipas': 0.025,
  'Ben Shelton': 0.02,
  'Andrey Rublev': 0.02,
  'Hubert Hurkacz': 0.02,
  'Lorenzo Musetti': 0.018,
  'Tommy Paul': 0.015,
  'Grigor Dimitrov': 0.015,
  'Frances Tiafoe': 0.012,
  'Felix Auger-Aliassime': 0.012,
  'Arthur Fils': 0.01,
  'Ugo Humbert': 0.01,
  'Sebastian Korda': 0.01,
  'Karen Khachanov': 0.008,
  'Alexander Bublik': 0.008,
  'Alexei Popyrin': 0.007,
  'Cameron Norrie': 0.006,
  'Nicolas Jarry': 0.006,
  'Adrian Mannarino': 0.005,
  'Tallon Griekspoor': 0.005,
  'Sebastian Baez': 0.005,
  'Jannik Paul': 0.004,
};

// WTA 2026 Grand Slam aggregate — preseason implied win probabilities.
const WTA_PRESEASON_ODDS = {
  'Aryna Sabalenka': 0.14,
  'Iga Swiatek': 0.13,
  'Coco Gauff': 0.10,
  'Elena Rybakina': 0.06,
  'Qinwen Zheng': 0.05,
  'Jasmine Paolini': 0.04,
  'Jessica Pegula': 0.035,
  'Madison Keys': 0.03,
  'Emma Navarro': 0.025,
  'Karolina Muchova': 0.025,
  'Barbora Krejcikova': 0.02,
  'Marketa Vondrousova': 0.02,
  'Ons Jabeur': 0.02,
  'Danielle Collins': 0.018,
  'Donna Vekic': 0.015,
  'Maria Sakkari': 0.015,
  'Katie Boulter': 0.015,
  'Linda Noskova': 0.012,
  'Daria Kasatkina': 0.01,
  'Jelena Ostapenko': 0.01,
  'Marta Kostyuk': 0.01,
  'Beatriz Haddad Maia': 0.008,
  'Leylah Fernandez': 0.008,
  'Victoria Azarenka': 0.008,
  'Caroline Garcia': 0.007,
  'Liudmila Samsonova': 0.006,
  'Sloane Stephens': 0.005,
  'Veronika Kudermetova': 0.005,
  'Elise Mertens': 0.004,
  'Anastasia Pavlyuchenkova': 0.004,
};

const SCRAPED_SPORT_CODES = ['F1'];

// Mirrors calculateEP in oddsApi.js — duplicated to avoid circular import
function calculateEPFromProb(p) {
  const pTop2 = Math.min(1, 2 * p);
  const pTop4 = Math.min(1, 4 * p);
  const pTop8 = Math.min(1, 12 * p);
  return p * 80 + (pTop2 - p) * 50 + (pTop4 - pTop2) * 30 + (pTop8 - pTop4) * 20;
}

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
 * Returns preseason fallback EP for multi-event sports when all API markets are dark
 * and no stale cache exists. Returns { playerName: ep } or null if no fallback defined.
 */
export function getPreseasonFallbackEP(sportCode) {
  let oddsMap = null;
  if (sportCode === 'MensTennis') oddsMap = ATP_PRESEASON_ODDS;
  else if (sportCode === 'WomensTennis') oddsMap = WTA_PRESEASON_ODDS;
  if (!oddsMap) return null;

  const normalized = normalizeOdds(oddsMap);
  const result = {};
  for (const [name, prob] of Object.entries(normalized)) {
    result[name] = Math.round(calculateEPFromProb(prob) * 10) / 10;
  }
  return result;
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
