// useTeamPerformance.js
// Fetches the most recently COMPLETED season's results for a team/player.
// Reads from the sport_results Supabase cache; if empty, triggers a fresh
// fetch via resultsApi to populate it (free ESPN/Jolpica APIs, cache-first).
//
// Returns structured results based on sport type:
//   - Single-event (NFL, NBA, etc.): last completed season placement
//   - Multi-event (Golf, Tennis): per-event results across the 4 majors/slams
//   - F1: championship standings position

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { fetchSportResults } from './resultsApi';

const TENNIS_SPORTS = new Set(['MensTennis', 'WomensTennis']);

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
      // Fetch the two most recent rows so we can prefer a completed season.
      // e.g. for NBA in March 2026: row 0 = 2025-26 (in-progress), row 1 = 2024-25 (complete).
      // We prefer the completed row for the playoff result display.
      const { data, error } = await supabase
        .from('sport_results')
        .select('results, season')
        .eq('sport_code', sport)
        .order('season', { ascending: false })
        .limit(2);

      if (cancelled) return;

      let row = null;
      if (!error && data?.length) {
        // Prefer the most recently completed season
        row = data.find(d => d.results?.is_complete) || data[0];
      }

      // If no cached data at all, trigger a fresh fetch from ESPN/Jolpica.
      // fetchSportResults handles its own DB cache internally.
      if (!row?.results) {
        const fresh = await fetchSportResults(sport);
        if (cancelled) return;
        if (fresh) {
          row = { results: fresh, season: fresh.season };
        }
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
