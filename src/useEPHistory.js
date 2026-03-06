// useEPHistory.js
// Fetches EP trend history for a specific team within a sport.
// Data is collected at each odds cache refresh (~every 2 days).
// Returns history in chronological order for use in a line chart.

import { useState, useEffect } from 'react';
import { getEPHistory } from './supabaseClient';

/**
 * Fetch and extract the EP trend for one team within a sport.
 * @param {string} sportCode  - e.g. 'NFL', 'NBA', 'MensTennis'
 * @param {string} teamName   - exact team/player name as stored in snapshot_data
 * @returns {{ history: Array<{date: string, ep: number}>, loading: boolean }}
 *   history items: date = 'Mar 2' formatted string, ep = numeric EP value
 */
export function useEPHistory(sportCode, teamName) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sportCode || !teamName) {
      setHistory([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setHistory([]);

    getEPHistory(sportCode, 180).then(({ data }) => {
      if (cancelled) return;

      // Extract this team's value from each snapshot; skip snapshots where
      // the team is absent (e.g. early snapshots before they were included).
      const points = (data || [])
        .filter(row => row.snapshot_data?.[teamName] != null)
        .map(row => ({
          date: new Date(row.captured_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          ep: row.snapshot_data[teamName],
        }));

      setHistory(points);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [sportCode, teamName]);

  return { history, loading };
}
