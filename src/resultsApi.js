import { normalizeResultName, normalizeF1Name } from './utils/aliases';

// resultsApi.js
// Automatically fetches final results for each sport once its season completes.
// Results are cached in the Supabase `sport_results` table (shared across all users).
//
// Data sources:
//   - ESPN public API (no auth): NFL, NBA, MLB, NHL, NCAAF, NCAAMB, UCL, WorldCup, Euro, Golf, Tennis
//   - Jolpica API (free, no auth): F1 (same source used by oddsScraper.js)
//
// Cache TTL:
//   - 30 days when is_complete=true (season over, results won't change)
//   -  4 hours when is_complete=false (still in progress, check again later)
//
// Result shape (single-event sports):
//   { champion, runner_up, semifinals[], quarterfinalists[], is_complete, season }
//
// Result shape (multi-event: Golf/MensTennis/WomensTennis):
//   { events: [{ name, champion, runner_up, semifinals[], quarterfinalists[], is_complete }], is_complete, season }
//
// Result shape (F1):
//   { standings: [ordered driver names, pos 0 = champion], is_complete, season }

import { getResultsCache, upsertResultsCache } from './supabaseClient';

const JOLPICA_F1_STANDINGS = 'https://api.jolpi.ca/ergast/f1/current/driverStandings.json';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

const COMPLETE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const IN_PROGRESS_TTL = 4 * 60 * 60 * 1000;     // 4 hours

// ─── Sport → ESPN path configuration ────────────────────────────────────────

// seasonType: 2 = regular season, 3 = postseason/knockout
const ESPN_CONFIG = {
  NFL:     { sport: 'football',   league: 'nfl',                    seasonType: 3 },
  NBA:     { sport: 'basketball', league: 'nba',                    seasonType: 3 },
  MLB:     { sport: 'baseball',   league: 'mlb',                    seasonType: 3 },
  NHL:     { sport: 'hockey',     league: 'nhl',                    seasonType: 3 },
  NCAAF:   { sport: 'football',   league: 'college-football',        seasonType: 3 },
  NCAAMB:  { sport: 'basketball', league: 'mens-college-basketball', seasonType: 3 },
  UCL:     { sport: 'soccer',     league: 'uefa.champions',          seasonType: 2 },
  WorldCup:{ sport: 'soccer',     league: 'fifa.world',              seasonType: 2 },
  Euro:    { sport: 'soccer',     league: 'uefa.euro',               seasonType: 2 },
};

// Round name fragments that identify each bracket stage.
// Matched case-insensitively against the ESPN `season.slug` or `type.text` or note text.
const ROUND_MATCHERS = {
  NFL: {
    championship: ['super bowl'],
    semifinals:   ['conference championship'],
    quarterfinals:['divisional'],
  },
  NBA: {
    championship: ['finals'],
    semifinals:   ['conference finals'],
    quarterfinals:['conference semifinals', 'second round'],
  },
  MLB: {
    championship: ['world series'],
    semifinals:   ['championship series'],
    quarterfinals:['division series'],
  },
  NHL: {
    championship: ['stanley cup final', 'finals'],
    semifinals:   ['conference finals'],
    quarterfinals:['conference semifinals', 'second round'],
  },
  NCAAF: {
    championship: ['national championship', 'cfp championship'],
    semifinals:   ['cfp semifinal', 'semifinals'],
    quarterfinals:['quarterfinal'],
  },
  NCAAMB: {
    championship: ['championship'],
    semifinals:   ['final four', 'national semifinals'],
    quarterfinals:['elite eight', 'regional'],
  },
  UCL: {
    championship: ['final'],
    semifinals:   ['semifinal', 'semi-final'],
    quarterfinals:['quarterfinal', 'quarter-final'],
  },
  WorldCup: {
    championship: ['final'],
    semifinals:   ['semifinal', 'semi-final'],
    quarterfinals:['quarterfinal', 'quarter-final'],
  },
  Euro: {
    championship: ['final'],
    semifinals:   ['semifinal', 'semi-final'],
    quarterfinals:['quarterfinal', 'quarter-final'],
  },
};


// ─── Season year helpers ─────────────────────────────────────────────────────

/**
 * Returns the "season year" for a sport code — the year the season started.
 * Sports spanning two calendar years use the start year.
 */
function getSeasonYear(sportCode) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // These leagues have a season that starts mid-year and ends the following year.
  // Before July of the completion year, they're still in the prior season.
  if (['NFL', 'NCAAF', 'NBA', 'NHL'].includes(sportCode) && month < 7) {
    return year - 1;
  }
  // NCAAMB season starts Oct/Nov, March Madness ends in April
  if (sportCode === 'NCAAMB' && month < 5) {
    return year - 1;
  }
  // UCL season starts August, Final is in May of next year
  if (sportCode === 'UCL' && month < 6) {
    return year - 1;
  }
  return year;
}

/**
 * Returns the calendar year ESPN uses in its API for the season.
 * For cross-year seasons this is typically the end/completion year.
 */
function getEspnSeasonYear(sportCode) {
  const season = getSeasonYear(sportCode);
  // ESPN references cross-year seasons by the completion year
  if (['NFL', 'NCAAF', 'NBA', 'NHL', 'NCAAMB', 'UCL'].includes(sportCode)) {
    return season + 1;
  }
  return season;
}

// ─── ESPN scoreboard fetcher ─────────────────────────────────────────────────

async function fetchEspnScoreboard(sportCode) {
  const config = ESPN_CONFIG[sportCode];
  if (!config) return [];

  const espnYear = getEspnSeasonYear(sportCode);
  const url = `${ESPN_BASE}/${config.sport}/${config.league}/scoreboard`
    + `?seasontype=${config.seasonType}&season=${espnYear}&limit=200`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data?.events || [];
  } catch {
    return [];
  }
}

/**
 * Classify a competition's round into 'championship', 'semifinals', 'quarterfinals', or null.
 * Uses the ROUND_MATCHERS for the sport. Checks multiple ESPN fields for the round name.
 */
function classifyRound(competition, sportCode) {
  const matchers = ROUND_MATCHERS[sportCode];
  if (!matchers) return null;

  // ESPN stores round info in several places depending on sport
  const candidates = [
    competition?.type?.text,
    competition?.type?.abbreviation,
    competition?.season?.slug,
    competition?.notes?.[0]?.headline,
    competition?.notes?.[0]?.text,
  ].filter(Boolean).map(s => s.toLowerCase());

  for (const [stage, patterns] of Object.entries(matchers)) {
    if (patterns.some(p => candidates.some(c => c.includes(p)))) {
      return stage;
    }
  }
  return null;
}

/**
 * Get winner and loser from a completed ESPN competition.
 * Handles both single-game (football/soccer) and series (basketball/hockey/baseball).
 */
function getWinnerLoser(competition) {
  const competitors = competition?.competitors || [];
  if (competitors.length !== 2) return null;

  // Series: check series.winner field
  const hasSeries = competitors.some(c => c.series?.winner !== undefined);
  if (hasSeries) {
    const winner = competitors.find(c => c.series?.winner);
    const loser  = competitors.find(c => !c.series?.winner);
    if (!winner || !loser) return null;
    return {
      winner: normalizeResultName(winner.team?.displayName || winner.team?.name || ''),
      loser:  normalizeResultName(loser.team?.displayName  || loser.team?.name  || ''),
    };
  }

  // Single game: check winner flag
  if (!competition.status?.type?.completed) return null;
  const winner = competitors.find(c => c.winner);
  const loser  = competitors.find(c => !c.winner);
  if (!winner || !loser) return null;
  return {
    winner: normalizeResultName(winner.team?.displayName || winner.team?.name || ''),
    loser:  normalizeResultName(loser.team?.displayName  || loser.team?.name  || ''),
  };
}

/**
 * Parse an ESPN scoreboard event list into { champion, runner_up, semifinals[], quarterfinalists[], is_complete }.
 */
function parseEspnBracket(events, sportCode) {
  let champion = null;
  let runner_up = null;
  const semifinals = [];
  const quarterfinalists = [];

  for (const event of events) {
    for (const competition of event.competitions || []) {
      const stage = classifyRound(competition, sportCode);
      if (!stage) continue;

      const result = getWinnerLoser(competition);
      if (!result) continue;

      if (stage === 'championship') {
        champion  = result.winner;
        runner_up = result.loser;
      } else if (stage === 'semifinals') {
        if (!semifinals.includes(result.loser)) semifinals.push(result.loser);
      } else if (stage === 'quarterfinals') {
        if (!quarterfinalists.includes(result.loser)) quarterfinalists.push(result.loser);
      }
    }
  }

  const is_complete = !!champion;
  return { champion, runner_up, semifinals, quarterfinalists, is_complete };
}

// ─── F1 results ──────────────────────────────────────────────────────────────


/**
 * Fetch F1 final driver standings from Jolpica.
 * Returns { standings: [string], is_complete: bool, season: number }
 */
async function fetchF1Results() {
  const season = getSeasonYear('F1');
  try {
    // Fetch final standings for the season year
    const url = `https://api.jolpi.ca/ergast/f1/${season}/driverStandings.json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Jolpica error');

    const data = await resp.json();
    const standingsList = data?.MRData?.StandingsTable?.StandingsLists;
    const standings = standingsList?.[0]?.DriverStandings;
    if (!standings || standings.length === 0) return null;

    // Determine if the season is complete.
    // The Jolpica response includes the total number of races; compare to rounds completed.
    const totalRaces = parseInt(data?.MRData?.total, 10) || 0;
    const racesInSeason = parseInt(data?.MRData?.StandingsTable?.StandingsLists?.[0]?.round, 10) || 0;

    // Also check: if we're in a year after the season (F1 seasons end ~November/December),
    // treat it as complete once the data contains 20+ races.
    const now = new Date();
    const afterSeasonEnd = now.getFullYear() > season
      || (now.getFullYear() === season && now.getMonth() >= 11); // December
    const is_complete = afterSeasonEnd && racesInSeason >= 20;

    const driverNames = standings.map(s => {
      const fullName = `${s.Driver.givenName} ${s.Driver.familyName}`;
      return normalizeF1Name(fullName);
    });

    return { standings: driverNames, is_complete, season };
  } catch {
    return null;
  }
}

// ─── Golf & Tennis (multi-event via ESPN) ───────────────────────────────────

// ESPN event IDs for Golf majors (update each year)
// These are the ESPN event slugs used in the Golf scoreboard endpoint.
// approxMonth = the calendar month the event typically starts (1=Jan, used to filter
// out events that occurred before a league's draft date).
const GOLF_MAJORS = [
  { name: 'Masters',          espnLeague: 'golf/pga', slug: 'masters',               approxMonth: 4 }, // April
  { name: 'PGA Championship', espnLeague: 'golf/pga', slug: 'pga-championship',       approxMonth: 5 }, // May
  { name: 'US Open',          espnLeague: 'golf/pga', slug: 'us-open',                approxMonth: 6 }, // June
  { name: 'The Open',         espnLeague: 'golf/pga', slug: 'the-open-championship',  approxMonth: 7 }, // July
];

// ESPN event slugs for tennis Grand Slams
const TENNIS_GRAND_SLAMS_MEN = [
  { name: 'Australian Open', espnLeague: 'tennis/atp', slug: 'australian-open', approxMonth: 1 }, // January
  { name: 'French Open',     espnLeague: 'tennis/atp', slug: 'french-open',     approxMonth: 5 }, // late May
  { name: 'Wimbledon',       espnLeague: 'tennis/atp', slug: 'wimbledon',       approxMonth: 6 }, // late June
  { name: 'US Open',         espnLeague: 'tennis/atp', slug: 'us-open',         approxMonth: 8 }, // late August
];

const TENNIS_GRAND_SLAMS_WOMEN = [
  { name: 'Australian Open', espnLeague: 'tennis/wta', slug: 'australian-open', approxMonth: 1 }, // January
  { name: 'French Open',     espnLeague: 'tennis/wta', slug: 'french-open',     approxMonth: 5 }, // late May
  { name: 'Wimbledon',       espnLeague: 'tennis/wta', slug: 'wimbledon',       approxMonth: 6 }, // late June
  { name: 'US Open',         espnLeague: 'tennis/wta', slug: 'us-open',         approxMonth: 8 }, // late August
];

/**
 * Fetch results for a single golf major or tennis Grand Slam from ESPN.
 * ESPN tournament scoreboard: GET /sports/{espnLeague}/scoreboard?limit=200
 * We look for the completed tournament matching the slug.
 */
async function fetchTournamentResults(tournamentConfig) {
  const { name, espnLeague, slug, approxMonth } = tournamentConfig;
  const year = new Date().getFullYear();
  try {
    const url = `${ESPN_BASE}/${espnLeague}/scoreboard?limit=200`;
    const resp = await fetch(url);
    if (!resp.ok) return { name, is_complete: false, approxMonth, year };

    const data = await resp.json();
    const events = data?.events || [];

    // Find the event matching our slug or name
    const event = events.find(e => {
      const eName = (e.name || e.slug || '').toLowerCase();
      return eName.includes(slug) || eName.includes(name.toLowerCase());
    });

    if (!event || !event.competitions?.length) return { name, is_complete: false, approxMonth, year };

    // For golf/tennis, the competition list has one entry per round.
    // The final round determines champion (winner) and runner-up (finalist).
    // Look for the "Final" round competition.
    const finalComp = event.competitions.find(c => {
      const round = (c.type?.text || c.status?.type?.name || '').toLowerCase();
      return round.includes('final') && !round.includes('semi') && !round.includes('quarter');
    });

    const semiComps = event.competitions.filter(c => {
      const round = (c.type?.text || c.status?.type?.name || '').toLowerCase();
      return round.includes('semifinal') || round.includes('semi-final');
    });

    const quarterComps = event.competitions.filter(c => {
      const round = (c.type?.text || c.status?.type?.name || '').toLowerCase();
      return round.includes('quarterfinal') || round.includes('quarter-final');
    });

    // For golf (stroke play), the competitors list on the tournament event holds the leaderboard.
    // The "winner" is the first-place finisher.
    // ESPN golf scoreboard competitors are sorted by position.
    const isGolf = espnLeague.startsWith('golf');
    if (isGolf) {
      const golfResult = parsGolfResults(event, name);
      return { ...golfResult, approxMonth, year };
    }

    // Tennis: parse bracket-style
    if (!finalComp) return { name, is_complete: false, approxMonth, year };

    const finalResult = getWinnerLoser(finalComp);
    if (!finalResult) return { name, is_complete: false, approxMonth, year };

    const semifinals = semiComps
      .map(c => getWinnerLoser(c))
      .filter(Boolean)
      .map(r => r.loser);

    const quarterfinalists = quarterComps
      .map(c => getWinnerLoser(c))
      .filter(Boolean)
      .map(r => r.loser);

    return {
      name,
      champion:        finalResult.winner,
      runner_up:       finalResult.loser,
      semifinals,
      quarterfinalists,
      is_complete: true,
      approxMonth,
      year,
    };
  } catch {
    return { name, is_complete: false, approxMonth, year };
  }
}

/**
 * Parse a stroke-play golf tournament into champion/runner_up/semis/quarters.
 * ESPN golf events list competitors with position data.
 * We treat Top-4 as "final four", top-8 as "quarters" for fantasy scoring.
 */
function parsGolfResults(event, name) {
  // Competitors are in the tournament-level competitors array, sorted by position
  const competitors = event.competitions?.[0]?.competitors || [];
  if (competitors.length === 0) return { name, is_complete: false };

  // Only include if the tournament status is complete
  const completed = event.status?.type?.completed || event.competitions?.[0]?.status?.type?.completed;
  if (!completed) return { name, is_complete: false };

  // Sort by position
  const sorted = [...competitors]
    .filter(c => c.status?.position?.id !== undefined || c.statistics)
    .sort((a, b) => {
      const posA = parseInt(a.status?.position?.id || a.athlete?.position || 99, 10);
      const posB = parseInt(b.status?.position?.id || b.athlete?.position || 99, 10);
      return posA - posB;
    });

  const getName = (c) => {
    const raw = c.athlete?.displayName || c.athlete?.fullName || c.team?.displayName || '';
    return normalizeResultName(raw);
  };

  const champion        = getName(sorted[0]);
  const runner_up       = getName(sorted[1]);
  const semifinals      = [sorted[2], sorted[3]].filter(Boolean).map(getName);
  const quarterfinalists= [sorted[4], sorted[5], sorted[6], sorted[7]].filter(Boolean).map(getName);

  if (!champion) return { name, is_complete: false };

  return { name, champion, runner_up, semifinals, quarterfinalists, is_complete: true };
}

/**
 * Fetch results for all 4 Golf majors.
 * Returns { events[], is_complete, season }
 */
async function fetchGolfResults() {
  const season = getSeasonYear('Golf');
  const events = await Promise.all(GOLF_MAJORS.map(fetchTournamentResults));
  const is_complete = events.every(e => e.is_complete);
  return { events, is_complete, season };
}

/**
 * Fetch results for all 4 Men's Tennis Grand Slams.
 */
async function fetchMensTennisResults() {
  const season = getSeasonYear('MensTennis');
  const events = await Promise.all(TENNIS_GRAND_SLAMS_MEN.map(fetchTournamentResults));
  const is_complete = events.every(e => e.is_complete);
  return { events, is_complete, season };
}

/**
 * Fetch results for all 4 Women's Tennis Grand Slams.
 */
async function fetchWomensTennisResults() {
  const season = getSeasonYear('WomensTennis');
  const events = await Promise.all(TENNIS_GRAND_SLAMS_WOMEN.map(fetchTournamentResults));
  const is_complete = events.every(e => e.is_complete);
  return { events, is_complete, season };
}

// ─── Main fetch function ─────────────────────────────────────────────────────

/**
 * Fetch results for a single sport code.
 * Checks Supabase cache first; only calls external APIs if cache is missing or stale.
 * Returns the results object or null on error.
 */
export async function fetchSportResults(sportCode) {
  const season = getSeasonYear(sportCode);

  // Check cache
  try {
    const { data: cached } = await getResultsCache(sportCode, season);
    if (cached?.results && Object.keys(cached.results).length > 0) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      const ttl = cached.results.is_complete ? COMPLETE_TTL : IN_PROGRESS_TTL;
      if (age < ttl) {
        return cached.results;
      }
    }
  } catch {
    // Cache miss — proceed to fetch
  }

  // Fetch fresh data
  let results = null;
  try {
    if (sportCode === 'F1') {
      results = await fetchF1Results();
    } else if (sportCode === 'Golf') {
      results = await fetchGolfResults();
    } else if (sportCode === 'MensTennis') {
      results = await fetchMensTennisResults();
    } else if (sportCode === 'WomensTennis') {
      results = await fetchWomensTennisResults();
    } else if (ESPN_CONFIG[sportCode]) {
      const events = await fetchEspnScoreboard(sportCode);
      const parsed = parseEspnBracket(events, sportCode);
      results = { ...parsed, season };
    }
  } catch {
    results = null;
  }

  if (!results) return null;

  // Store in cache
  try {
    await upsertResultsCache(sportCode, season, results);
  } catch {
    // Cache write failed — not critical
  }

  return results;
}

/**
 * Fetch results for multiple sport codes in parallel.
 * Returns { sportCode: resultObject | null, ... }
 */
export async function fetchAllResults(sportCodes) {
  const entries = await Promise.all(
    sportCodes.map(async (code) => [code, await fetchSportResults(code)])
  );
  return Object.fromEntries(entries);
}
