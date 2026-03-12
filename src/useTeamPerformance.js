// useTeamPerformance.js
// Fetches recent performance data for a team/player from the sport_results cache.
// Returns structured results based on sport type:
//   - Single-event (NFL, NBA, etc.): last season placement
//   - Multi-event (Golf, Tennis): per-event results across the 4 majors/slams
//   - F1: championship standings position

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

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

export function useTeamPerformance(sport, team) {
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sport || !team) return;
    let cancelled = false;
    setLoading(true);
    setPerformance(null);

    supabase
      .from('sport_results')
      .select('results, season')
      .eq('sport_code', sport)
      .order('season', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error || !data?.results) return;

        const { results, season } = data;

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
      });

    return () => { cancelled = true; };
  }, [sport, team]);

  return { performance, loading };
}
