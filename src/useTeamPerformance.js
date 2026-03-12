// useTeamPerformance.js
// Fetches the most recently COMPLETED season's results for a team/player.
//
// Strategy:
//   1. Query sport_results DB for the 2 most recent rows, prefer the completed one.
//   2. If no completed row in DB, call fetchSportResults to populate the cache and try again.
//   3. If the current season is still in-progress, fetch the *previous* season year from ESPN.
//   4. Fall back to in-progress row as last resort (shows mid-season standing, no playoff label).

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { fetchSportResults, getSeasonYear } from './resultsApi';
import { SPORT_SEASONS } from './useTeamRecord';

const TENNIS_SPORTS = new Set(['MensTennis', 'WomensTennis']);

// Sports where SPORT_SEASONS uses ESPN end-year convention (e.g. NBA 2024-25 → 2025).
// fetchSportResults uses start-year convention (2024), so we subtract 1.
const CROSS_YEAR_SPORTS = new Set(['NFL', 'NCAAF', 'NBA', 'NHL', 'NCAAMB', 'UCL']);

// Convert a SPORT_SEASONS year (ESPN end-year convention) to the season year used by
// fetchSportResults and the sport_results DB (start-year convention for cross-year sports).
function toResultsYear(sportCode, espnYear) {
  return CROSS_YEAR_SPORTS.has(sportCode) ? espnYear - 1 : espnYear;
}

// Returns the season year to pass to fetchSportResults for the most recently completed season.
// Uses SPORT_SEASONS metadata so tournament sports (WorldCup 2022, Euro 2024) get the right year
// instead of the naive getSeasonYear() - 1 calculation which would give 2025 for both.
function getTargetCompletedYear(sport) {
  const s = SPORT_SEASONS[sport];
  if (!s) return getSeasonYear(sport) - 1;
  // If the current season is already complete, target it; otherwise target the previous season.
  const espnYear = s.currentComplete ? s.current : s.previous;
  return toResultsYear(sport, espnYear);
}

function findSingleEventResult(results, team) {
  if (results.champion === team) return 'champion';
  if (results.runner_up === team) return 'runner_up';
  if (results.semifinals?.includes(team)) return 'semifinalist';
  if (results.quarterfinalists?.includes(team)) return 'quarterfinalist';
  if (results.is_complete) return 'none';
  return null; // season in progress, team hasn't been eliminated yet
}

function findEventResult(event, team, sport) {
  if (event.champion === team) return 'champion';
  if (event.runner_up === team) return 'runner_up';
  if (event.semifinals?.includes(team)) return 'semifinalist';
  if (event.quarterfinalists?.includes(team)) return 'quarterfinalist';
  if (sport === 'Golf' && event.ninth_to_sixteenth?.includes(team)) return 't9_t16';
  if (TENNIS_SPORTS.has(sport) && event.round_of_sixteen?.includes(team)) return 'r16';
  if (event.is_complete) return 'none';
  return null; // event not yet complete
}

function applyResults(results, season, sport, team, setPerformance) {
  if (sport === 'F1') {
    const pos = (results.standings || []).indexOf(team);
    setPerformance({
      type: 'f1',
      season,
      position: pos >= 0 ? pos + 1 : null,
      total: results.standings?.length || 20,
      isComplete: !!results.is_complete,
    });
  } else if (sport === 'Golf' || TENNIS_SPORTS.has(sport)) {
    const events = (results.events || []).map(ev => ({
      name: ev.name,
      result: findEventResult(ev, team, sport),
      isComplete: !!ev.is_complete,
    }));
    setPerformance({
      type: 'multi',
      season,
      sport,
      events,
      isComplete: !!results.is_complete,
    });
  } else {
    setPerformance({
      type: 'single',
      season,
      result: findSingleEventResult(results, team),
      isComplete: !!results.is_complete,
    });
  }
}

export function useTeamPerformance(sport, team) {
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sport || !team) return;
    let cancelled = false;
    setLoading(true);
    setPerformance(null);

    async function load() {
      // Step 1: Query the 2 most recent cached rows; prefer a completed season.
      // For in-progress sports (e.g. NBA 2025-26), this surfaces the prior
      // completed season (e.g. 2024-25) if it was ever cached.
      const { data } = await supabase
        .from('sport_results')
        .select('results, season')
        .eq('sport_code', sport)
        .order('season', { ascending: false })
        .limit(2);

      if (cancelled) return;

      let row = data?.find(d => d.results?.is_complete) || null;

      // Step 2: If no completed row, trigger a fresh fetch for the current season.
      if (!row) {
        const fresh = await fetchSportResults(sport);
        if (cancelled) return;
        if (fresh?.is_complete) {
          row = { results: fresh, season: fresh.season };
        } else {
          // Current season in-progress (or not yet started) — fetch the most recently
          // completed season using SPORT_SEASONS metadata for the correct year.
          // This handles tournament sports like WorldCup (2022) and Euro (2024) where
          // getSeasonYear() - 1 would incorrectly give 2025 instead of the real year.
          const targetYear  = getTargetCompletedYear(sport);
          const currentYear = getSeasonYear(sport);
          if (targetYear !== currentYear) {
            const freshPrev = await fetchSportResults(sport, targetYear);
            if (cancelled) return;
            if (freshPrev?.is_complete) {
              row = { results: freshPrev, season: freshPrev.season };
            }
          }
        }
      }

      // Step 3: Fall back to whatever in-progress row we have (shows live standings,
      // no playoff label — better than showing nothing).
      if (!row && data?.length) {
        row = data[0];
      }

      if (cancelled) return;
      setLoading(false);
      if (!row?.results) return;

      applyResults(row.results, row.season, sport, team, setPerformance);
    }

    load().catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [sport, team]);

  return { performance, loading };
}
