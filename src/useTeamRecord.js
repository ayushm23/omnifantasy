// useTeamRecord.js
// Fetches live season record/standings for a team from ESPN or Jolpica APIs.
// Caches results in localStorage with a 1-hour TTL to avoid redundant fetches.
//
// Supported sports: NFL, NBA, MLB, NHL, NCAAF, NCAAMB, UCL, F1
// Golf, Tennis, Euro, WorldCup: returns null (use sport_results data instead)
//
// Return shape (team sports):
//   { type:'team', wins, losses, otLosses, ties, playoffSeed, division, teamDisplayName }
// Return shape (F1):
//   { type:'f1', position, points, wins, total }

import { useState, useEffect } from 'react';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ESPN standings API slugs — mirrors resultsApi.js ESPN_CONFIG
const ESPN_STANDINGS_CONFIG = {
  NFL:    { sport: 'football',    league: 'nfl' },
  NBA:    { sport: 'basketball',  league: 'nba' },
  MLB:    { sport: 'baseball',    league: 'mlb' },
  NHL:    { sport: 'hockey',      league: 'nhl' },
  NCAAF:  { sport: 'football',    league: 'college-football' },
  NCAAMB: { sport: 'basketball',  league: 'mens-college-basketball' },
  UCL:    { sport: 'soccer',      league: 'uefa.champions' },
};

// Current and previous season years per sport.
// ESPN uses the ending calendar year for multi-year seasons (NBA 2025-26 → year 2026).
// Update at the start of each new season.
export const SPORT_SEASONS = {
  NFL:          { current: 2025, previous: 2024, currentLabel: '2025',    previousLabel: '2024' },
  NBA:          { current: 2026, previous: 2025, currentLabel: '2025-26', previousLabel: '2024-25' },
  MLB:          { current: 2025, previous: 2024, currentLabel: '2025',    previousLabel: '2024' },
  NHL:          { current: 2026, previous: 2025, currentLabel: '2025-26', previousLabel: '2024-25' },
  NCAAF:        { current: 2025, previous: 2024, currentLabel: '2025',    previousLabel: '2024' },
  NCAAMB:       { current: 2026, previous: 2025, currentLabel: '2025-26', previousLabel: '2024-25' },
  UCL:          { current: 2026, previous: 2025, currentLabel: '2025-26', previousLabel: '2024-25' },
  F1:           { current: 2026, previous: 2025, currentLabel: '2026',    previousLabel: '2025' },
  Golf:         { current: 2026, previous: 2025, currentLabel: '2026',    previousLabel: '2025' },
  MensTennis:   { current: 2026, previous: 2025, currentLabel: '2026',    previousLabel: '2025' },
  WomensTennis: { current: 2026, previous: 2025, currentLabel: '2026',    previousLabel: '2025' },
  Euro:         { current: 2024, previous: 2020, currentLabel: '2024',    previousLabel: '2020' },
  WorldCup:     { current: 2022, previous: 2018, currentLabel: '2022',    previousLabel: '2018' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheKey(sport, team, season) {
  return `omnifantasy_record_${sport}_${season}_${team.replace(/\s+/g, '_').toLowerCase()}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + CACHE_TTL_MS }));
  } catch { /* storage full — ignore */ }
}

// Normalize a display name for fuzzy comparison
function norm(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

// Extract a stat value by name from an ESPN stats array
function stat(stats, name) {
  return stats?.find(s => s.name === name)?.value ?? null;
}

// ─── ESPN standings parser ────────────────────────────────────────────────────

// Recursively flatten all standings entries from ESPN's nested children structure
function flattenEntries(node, results = []) {
  if (node.standings?.entries?.length) results.push(...node.standings.entries);
  (node.children || []).forEach(c => flattenEntries(c, results));
  return results;
}

// Find group (division/conference) name for a given team display name
function findGroupName(node, teamDisplayName) {
  const n = norm(teamDisplayName);
  if (node.standings?.entries?.some(e => norm(e.team?.displayName) === n)) {
    return node.name || null;
  }
  for (const child of (node.children || [])) {
    const found = findGroupName(child, teamDisplayName);
    if (found) return found;
  }
  return null;
}

function findEntry(entries, teamName) {
  const needle = norm(teamName);
  // 1. Exact normalized match
  let entry = entries.find(e => norm(e.team?.displayName) === needle);
  if (entry) return entry;
  // 2. Nickname match — last word of team name (e.g. "LA Lakers" → "lakers")
  const parts = teamName.trim().split(/\s+/);
  const nickname = parts[parts.length - 1].toLowerCase();
  if (nickname.length > 3) {
    entry = entries.find(e => norm(e.team?.displayName).endsWith(nickname));
  }
  return entry || null;
}

async function fetchESPNStandings(sport, team, season) {
  const cfg = ESPN_STANDINGS_CONFIG[sport];
  if (!cfg) return null;

  const url = `https://site.api.espn.com/apis/v2/sports/${cfg.sport}/${cfg.league}/standings?season=${season}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();

  const entries = flattenEntries(json);
  if (!entries.length) return null;

  const entry = findEntry(entries, team);
  if (!entry) return null;

  const stats = entry.stats || [];
  const teamDisplayName = entry.team?.displayName || team;

  // Find division/group name
  let division = null;
  for (const child of (json.children || [])) {
    division = findGroupName(child, teamDisplayName);
    if (division) break;
  }

  return {
    type: 'team',
    teamDisplayName,
    wins: stat(stats, 'wins'),
    losses: stat(stats, 'losses'),
    otLosses: stat(stats, 'otLosses'),
    ties: stat(stats, 'ties'),
    playoffSeed: stat(stats, 'playoffSeed'),
    points: stat(stats, 'points'),      // hockey/soccer points
    winPercent: stat(stats, 'winPercent'),
    division,
  };
}

// ─── F1 / Jolpica ────────────────────────────────────────────────────────────

async function fetchF1Standings(driver, season) {
  const url = `https://api.jolpi.ca/ergast/f1/${season}/driverStandings.json?limit=30`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const list = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];

  const needle = norm(driver);
  const entry = list.find(s => {
    const full = norm(`${s.Driver?.givenName} ${s.Driver?.familyName}`);
    const last = norm(s.Driver?.familyName || '');
    return full === needle || last === needle;
  });
  if (!entry) return null;

  return {
    type: 'f1',
    position: parseInt(entry.position, 10),
    points: parseFloat(entry.points),
    wins: parseInt(entry.wins, 10),
    total: list.length,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Sports where we skip the standings fetch (rely on sport_results events data)
const SKIP_SPORTS = new Set(['Golf', 'MensTennis', 'WomensTennis', 'Euro', 'WorldCup']);

export function useTeamRecord(sport, team, season) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sport || !team || !season || SKIP_SPORTS.has(sport)) {
      setRecord(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const key = cacheKey(sport, team, season);
    const cached = readCache(key);
    if (cached) {
      setRecord(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setRecord(null);

    const fetch = async () => {
      try {
        const data = sport === 'F1'
          ? await fetchF1Standings(team, season)
          : await fetchESPNStandings(sport, team, season);
        if (cancelled) return;
        setRecord(data);
        if (data) writeCache(key, data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [sport, team, season]);

  return { record, loading, error };
}
