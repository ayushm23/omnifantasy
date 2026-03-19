// The Odds API integration for expected points calculation
// Fetches championship/outright winner odds and converts to expected points
// based on OmniFantasy scoring: Champion(80) + Runner-up(50) + Semis(30×2) + Quarters(20×4) = 270 total
//
// EP Model: Uses a positional probability model instead of simple p × 270.
// Given win probability p, we estimate probability of reaching each finishing position:
//   P(champion) = p, P(top 2) = min(1,2p), P(top 4) = min(1,4p), P(top 8) = min(1,12p)
// Then: EP = P(champ)×80 + P(runner-up)×50 + P(semifinalist)×30 + P(quarterfinalist)×20
//
// Note: P(top 8) uses 12p (not 8p) to better reflect that playoff-caliber teams reach
// the quarterfinal round ~60% of the time. The 8p uniform-distribution estimate
// understates this for teams that are clear playoff participants.
//
// Caching strategy: Store results in Supabase odds_cache table shared by all users.
// Refresh every 2 days to stay within free-tier API limits (500 credits/month).
// ~21 API calls per refresh × ~15 refreshes/month = ~315 credits/month.

import { getOddsCache, upsertOddsCache, insertEPHistory } from './supabaseClient';
import { fetchScrapedProbabilities, isScrapedSport, getPreseasonFallbackEP } from './oddsScraper';
import { normalizeOddsApiName } from './utils/aliases';
import { calculateEP } from './utils/epCalc';

const API_BASE = 'https://api.the-odds-api.com/v4/sports';
const CACHE_TTL = 2 * 24 * 60 * 60 * 1000; // 2 days
// Bump this when the EP formula changes to invalidate stale cached values
const CACHE_VERSION = 12;
const DEFAULT_ODDS_REGIONS = 'us';
const GLOBAL_ODDS_REGIONS = 'us,uk,eu,au';
// Sports where global bookmaker regions give better odds coverage
const GLOBAL_REGIONS_SPORTS = new Set(['UCL', 'Euro', 'WorldCup', 'MensTennis', 'WomensTennis']);
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
  MensTennis: [
    'tennis_atp_aus_open_singles',
    'tennis_atp_french_open',
    'tennis_atp_wimbledon',
    'tennis_atp_us_open',
  ],
  WomensTennis: [
    'tennis_wta_aus_open_singles',
    'tennis_wta_french_open',
    'tennis_wta_wimbledon',
    'tennis_wta_us_open',
  ],
  // F1 still uses scraper (Jolpica API — no Odds API coverage)
};

// calculateEP is imported above and re-exported so other callers can import from oddsApi.js
// without a breaking change. The implementation lives in src/utils/epCalc.js.
export { calculateEP };

/**
 * Convert American odds to implied probability
 */
function americanToImpliedProbability(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
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

  // Guard: no valid bookmaker outcomes → return empty so callers show "TBD" instead of NaN
  if (totalProb === 0) return {};

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
 * For multi-event sports (Golf, Tennis), averages across all events with live markets.
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

      // For multi-event sports (Golf, Tennis), average across events instead of summing.
      // The fantasy scoring is based on a single aggregate ranking, not per-event payouts.
      // Divide only by events that actually returned data — markets for upcoming slams/majors
      // often aren't open yet. Dividing only by active markets is equivalent to copying
      // those odds to the silent events, which is exactly the intended fallback behavior.
      if (sportKeys.length > 1) {
        const eventsWithData = results.filter(r => Object.keys(r).length > 0).length;
        if (eventsWithData > 1) {
          for (const name in aggregated) {
            aggregated[name] = Math.round((aggregated[name] / eventsWithData) * 10) / 10;
          }
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
    if (strictFuturesOnly) return {};
    if (staleData) return staleData;

    // No stale data either (e.g. cache cleared mid dead-zone) — use preseason fallback
    // for multi-event sports (Tennis). Write it to cache so the TTL applies normally;
    // it will be overwritten when real slam markets open.
    const fallback = getPreseasonFallbackEP(sportCode);
    if (fallback) {
      try {
        await upsertOddsCache(sportCode, { _v: CACHE_VERSION, ...fallback });
      } catch { /* ignore */ }
      return fallback;
    }

    return {};
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
