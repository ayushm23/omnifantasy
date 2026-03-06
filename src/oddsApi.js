// The Odds API integration for expected points calculation
// Fetches championship/outright winner odds and converts to expected points
// based on OmniFantasy scoring: Champion(80) + Runner-up(50) + Semis(30×2) + Quarters(20×4) = 270 total
//
// EP Model: Uses a positional probability model instead of simple p × 270.
// Given win probability p, we estimate probability of reaching each finishing position:
//   P(champion) = p, P(top 2) = min(1,2p), P(top 4) = min(1,4p), P(top 8) = min(1,8p)
// Then: EP = P(champ)×80 + P(runner-up)×50 + P(semifinalist)×30 + P(quarterfinalist)×20
// This correctly sums to 270 total EP across all teams for equally-distributed probabilities.
//
// Caching strategy: Store results in Supabase odds_cache table shared by all users.
// Refresh every 2 days to stay within free-tier API limits (500 credits/month).
// ~11 API calls per refresh × ~15 refreshes/month = ~165 credits/month.

import { getOddsCache, upsertOddsCache, insertEPHistory } from './supabaseClient';
import { fetchScrapedProbabilities, isScrapedSport } from './oddsScraper';
import { normalizeOddsApiName } from './utils/aliases';

const API_BASE = 'https://api.the-odds-api.com/v4/sports';
const API_FOOTBALL_BASE = 'https://api-football-v1.p.rapidapi.com/v3';
const API_FOOTBALL_HOST = 'api-football-v1.p.rapidapi.com';
const API_FOOTBALL_UCL_LEAGUE_ID = 2;
const CACHE_TTL = 2 * 24 * 60 * 60 * 1000; // 2 days
// Bump this when the EP formula changes to invalidate stale cached values
const CACHE_VERSION = 7;
const DEFAULT_ODDS_REGIONS = 'us';
const GLOBAL_ODDS_REGIONS = 'us,uk,eu,au';
const GLOBAL_REGIONS_SPORTS = new Set(['UCL', 'Euro', 'WorldCup']);
const STRICT_FUTURES_ONLY_SPORTS = new Set(['NCAAF']);

// Maps OmniFantasy sport codes to The Odds API sport keys
// Sports with multiple events (Golf) use arrays for aggregation
const SPORT_KEY_MAP = {
  NFL: ['americanfootball_nfl_super_bowl_winner'],
  NCAAF: ['americanfootball_ncaaf_championship_winner'], // seasonal — empty off-season
  NBA: ['basketball_nba_championship_winner'],
  NCAAMB: ['basketball_ncaab_championship_winner'],
  MLB: ['baseball_mlb_world_series_winner'],
  NHL: ['icehockey_nhl_championship_winner'],
  UCL: ['soccer_uefa_champs_league_winner'],
  Euro: ['soccer_uefa_european_championship_winner'],
  WorldCup: ['soccer_fifa_world_cup_winner'],
  Golf: [
    'golf_masters_tournament_winner',
    'golf_us_open_winner',
    'golf_the_open_championship_winner',
    'golf_pga_championship_winner',
  ],
  // No outright winner markets available on The Odds API:
  // MensTennis, WomensTennis, F1
};

// Scoring by finishing position
const CHAMPION_PTS = 80;
const RUNNER_UP_PTS = 50;
const SEMIFINALIST_PTS = 30;
const QUARTERFINALIST_PTS = 20;

/**
 * Calculate expected points from win probability using a positional model.
 * Instead of naive p × 270, we estimate the probability of reaching each
 * finishing position and weight by the points for that position.
 *
 * Given win probability p:
 *   P(top 2) ≈ min(1, 2p), P(top 4) ≈ min(1, 4p), P(top 8) ≈ min(1, 8p)
 *   P(runner-up) = P(top 2) - P(champion)
 *   P(semifinalist) = P(top 4) - P(top 2)
 *   P(quarterfinalist) = P(top 8) - P(top 4)
 *
 * This sums to exactly 270 total EP across all teams when probabilities
 * are uniformly distributed, and produces more realistic per-team values.
 */
export function calculateEP(winProbability) {
  const p = winProbability;
  const pTop2 = Math.min(1, 2 * p);
  const pTop4 = Math.min(1, 4 * p);
  const pTop8 = Math.min(1, 8 * p);

  const pChampion = p;
  const pRunnerUp = pTop2 - p;
  const pSemifinalist = pTop4 - pTop2;
  const pQuarterfinalist = pTop8 - pTop4;

  return pChampion * CHAMPION_PTS
       + pRunnerUp * RUNNER_UP_PTS
       + pSemifinalist * SEMIFINALIST_PTS
       + pQuarterfinalist * QUARTERFINALIST_PTS;
}

/**
 * Convert American odds to implied probability
 */
function americanToImpliedProbability(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function decimalToImpliedProbability(odds) {
  const value = parseFloat(odds);
  if (!Number.isFinite(value) || value <= 1) return null;
  return 1 / value;
}

function getCurrentEuropeanSeasonYear(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed
  // UEFA season starts in July.
  return month >= 6 ? year : year - 1;
}

/**
 * Fallback source for UCL expected points using API-Football match odds.
 * We derive team strength from implied win probabilities in available fixtures,
 * then normalize to championship probabilities for EP calculation.
 */
async function fetchUclExpectedPointsFromApiFootball(apiKey) {
  if (!apiKey) return {};

  const season = getCurrentEuropeanSeasonYear();
  const url = `${API_FOOTBALL_BASE}/odds?league=${API_FOOTBALL_UCL_LEAGUE_ID}&season=${season}`;

  const response = await fetch(url, {
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': API_FOOTBALL_HOST
    }
  });
  if (!response.ok) return {};

  const payload = await response.json();
  const oddsRows = payload?.response;
  if (!Array.isArray(oddsRows) || oddsRows.length === 0) return {};

  const teamStrength = {};

  for (const row of oddsRows) {
    const home = row?.teams?.home?.name;
    const away = row?.teams?.away?.name;
    if (!home || !away) continue;

    const bookmakers = row?.bookmakers || [];
    let matchWinnerValues = null;
    for (const bookmaker of bookmakers) {
      const market = bookmaker?.bets?.find(bet => bet?.name === 'Match Winner');
      if (market?.values?.length) {
        matchWinnerValues = market.values;
        break;
      }
    }
    if (!matchWinnerValues) continue;

    const homeOdd = matchWinnerValues.find(v => v?.value === 'Home' || v?.value === '1')?.odd;
    const awayOdd = matchWinnerValues.find(v => v?.value === 'Away' || v?.value === '2')?.odd;

    const pHomeRaw = decimalToImpliedProbability(homeOdd);
    const pAwayRaw = decimalToImpliedProbability(awayOdd);
    if (!pHomeRaw || !pAwayRaw) continue;

    // Renormalize to home/away only (drop draw probability).
    const denom = pHomeRaw + pAwayRaw;
    if (denom <= 0) continue;
    const pHome = pHomeRaw / denom;
    const pAway = pAwayRaw / denom;

    const homeName = normalizeOddsApiName(home);
    const awayName = normalizeOddsApiName(away);

    teamStrength[homeName] = (teamStrength[homeName] || 0) + pHome;
    teamStrength[awayName] = (teamStrength[awayName] || 0) + pAway;
  }

  const totalStrength = Object.values(teamStrength).reduce((sum, val) => sum + val, 0);
  if (totalStrength <= 0) return {};

  const result = {};
  for (const [team, strength] of Object.entries(teamStrength)) {
    const winProb = strength / totalStrength;
    result[team] = Math.round(calculateEP(winProb) * 10) / 10;
  }
  return result;
}

/**
 * Fetch odds for a single Odds API sport key and convert to expected points.
 * Returns { 'Team Name': expectedPoints, ... }
 */
async function fetchOddsForSportKey(apiKey, sportKey, regions = DEFAULT_ODDS_REGIONS) {
  const url = `${API_BASE}/${sportKey}/odds/?apiKey=${apiKey}&regions=${regions}&oddsFormat=american&markets=outrights`;

  const response = await fetch(url);
  if (!response.ok) return {};

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return {};

  const event = data[0];
  const bookmakers = event?.bookmakers || [];
  if (bookmakers.length === 0) return {};

  // Average odds across all bookmakers for better accuracy
  const teamOddsAccumulator = {};
  const teamOddsCount = {};

  for (const bookmaker of bookmakers) {
    const market = bookmaker.markets?.find(m => m.key === 'outrights');
    if (!market) continue;

    for (const outcome of market.outcomes || []) {
      const name = outcome.name;
      const prob = americanToImpliedProbability(outcome.price);
      teamOddsAccumulator[name] = (teamOddsAccumulator[name] || 0) + prob;
      teamOddsCount[name] = (teamOddsCount[name] || 0) + 1;
    }
  }

  // Average probabilities and normalize (remove vig)
  const rawProbs = {};
  let totalProb = 0;
  for (const name in teamOddsAccumulator) {
    rawProbs[name] = teamOddsAccumulator[name] / teamOddsCount[name];
    totalProb += rawProbs[name];
  }

  // Normalize and compute expected points, mapping API names to our teamPool names
  const result = {};
  for (const name in rawProbs) {
    const normalizedProb = rawProbs[name] / totalProb;
    const ep = Math.round(calculateEP(normalizedProb) * 10) / 10;
    const normalizedName = normalizeOddsApiName(name);
    // If multiple API names map to the same normalized name, sum them
    result[normalizedName] = Math.round(((result[normalizedName] || 0) + ep) * 10) / 10;
  }

  return result;
}

// Grace period: if cache is stale but was updated within this window,
// another client is likely already refreshing — use stale data instead of
// triggering a duplicate API call.
const REFRESH_GRACE = 60 * 1000; // 60 seconds

/**
 * Fetch expected points for a single OmniFantasy sport code.
 * Checks Supabase cache first (shared across all users, 2-day TTL).
 * Only calls The Odds API if cache is missing or stale.
 * Uses a refresh lock to prevent concurrent API calls from multiple clients.
 * For multi-event sports (Golf, Tennis), aggregates across all events.
 * Returns { 'Team Name': expectedPoints, ... }
 */
export async function fetchExpectedPoints(sportCode) {
  const sportKeys = SPORT_KEY_MAP[sportCode];
  const scraped = !sportKeys && isScrapedSport(sportCode);
  if (!sportKeys && !scraped) return {};
  const strictFuturesOnly = STRICT_FUTURES_ONLY_SPORTS.has(sportCode);

  // Check Supabase cache first
  let staleData = null;
  try {
    const { data: cached } = await getOddsCache(sportCode);
    if (cached && cached.data && Object.keys(cached.data).length > 0) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      // Ignore cache if it was written by an older EP formula version
      const versionMatch = cached.data._v === CACHE_VERSION;
      if (versionMatch && age < CACHE_TTL && !strictFuturesOnly) {
        // Fresh cache with correct formula — use it
        const { _v, ...teams } = cached.data;
        return teams;
      }
      // Stale cache — check if another client is already refreshing
      if (versionMatch && age < CACHE_TTL + REFRESH_GRACE && !strictFuturesOnly) {
        const { _v, ...teams } = cached.data;
        return teams;
      }
      if (versionMatch && !strictFuturesOnly) {
        const { _v, ...teams } = cached.data;
        staleData = teams;
      } else if (!strictFuturesOnly) {
        // Version mismatch means formula changed — still keep as last-resort
        // fallback in case the fresh fetch fails (better than showing TBD)
        const { _v, ...teams } = cached.data;
        staleData = teams;
      }

      // Claim the refresh by bumping updated_at now (optimistic lock)
      // Other clients seeing this within REFRESH_GRACE will use stale data
      try {
        await upsertOddsCache(sportCode, cached.data);
      } catch {
        // Lock claim failed — proceed anyway, worst case a duplicate call
      }
    }
  } catch {
    // Cache miss or DB error — proceed to fetch from API
  }

  // Fetch fresh data — either from The Odds API or the web scraper
  try {
    let aggregated = {};

    if (scraped) {
      // Scraped sport: fetch probabilities and convert to EP
      const probs = await fetchScrapedProbabilities(sportCode);
      for (const [name, prob] of Object.entries(probs)) {
        aggregated[name] = Math.round(calculateEP(prob) * 10) / 10;
      }
    } else {
      // Odds API sport: fetch from API
      const apiKey = import.meta.env.VITE_ODDS_API_KEY;
      if (!apiKey) {
        if (sportCode === 'UCL') {
          const apiFootballKey = import.meta.env.VITE_API_FOOTBALL_KEY;
          const fallback = await fetchUclExpectedPointsFromApiFootball(apiFootballKey);
          return Object.keys(fallback).length > 0 ? fallback : (staleData || {});
        }
        return strictFuturesOnly ? {} : (staleData || {});
      }

      const regions = GLOBAL_REGIONS_SPORTS.has(sportCode) ? GLOBAL_ODDS_REGIONS : DEFAULT_ODDS_REGIONS;
      const results = await Promise.all(
        sportKeys.map(key => fetchOddsForSportKey(apiKey, key, regions))
      );

      // Aggregate expected points across events
      for (const result of results) {
        for (const [name, ep] of Object.entries(result)) {
          aggregated[name] = Math.round(((aggregated[name] || 0) + ep) * 10) / 10;
        }
      }

      // For multi-event sports (e.g. Golf), average across events instead of summing.
      // The fantasy scoring is based on a single aggregate ranking, not per-event payouts.
      // Divide only by events that actually returned data — some majors have no odds
      // available early in the year, and dividing by 4 when only 2 returned data
      // would cut EP in half.
      if (sportKeys.length > 1) {
        const eventsWithData = results.filter(r => Object.keys(r).length > 0).length;
        if (eventsWithData > 1) {
          for (const name in aggregated) {
            aggregated[name] = Math.round((aggregated[name] / eventsWithData) * 10) / 10;
          }
        }
      }

      // Secondary source for UCL when outright market is unavailable.
      if (sportCode === 'UCL' && Object.keys(aggregated).length === 0) {
        const apiFootballKey = import.meta.env.VITE_API_FOOTBALL_KEY;
        const fallback = await fetchUclExpectedPointsFromApiFootball(apiFootballKey);
        if (Object.keys(fallback).length > 0) {
          aggregated = fallback;
        }
      }

    }

    // Save to Supabase cache (shared for all users)
    if (Object.keys(aggregated).length > 0) {
      try {
        await upsertOddsCache(sportCode, { _v: CACHE_VERSION, ...aggregated });
      } catch {
        // Cache write failed — not critical, data still returned
      }
      // Fire-and-forget: record EP snapshot for trend chart history (~every 2 days)
      insertEPHistory(sportCode, aggregated).catch(() => {});
      return aggregated;
    }

    // Fetch returned nothing — return stale data if available
    return strictFuturesOnly ? {} : (staleData || {});
  } catch {
    return strictFuturesOnly ? {} : (staleData || {});
  }
}

/**
 * Fetch expected points for multiple sport codes.
 * Returns { sportCode: { 'Team Name': expectedPoints, ... }, ... }
 */
export async function fetchAllExpectedPoints(sportCodes) {
  const results = {};
  const fetches = sportCodes.map(async (code) => {
    results[code] = await fetchExpectedPoints(code);
  });
  await Promise.all(fetches);
  return results;
}

/**
 * Check if a sport code is supported by The Odds API
 */
export function isSportSupported(sportCode) {
  return sportCode in SPORT_KEY_MAP || isScrapedSport(sportCode);
}
