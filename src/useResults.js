// useResults.js
// React hook that fetches final sport results for all sports in a league.
// Results are automatically fetched when a sport's season concludes and
// cached in Supabase — no commissioner action required.
//
// Usage:
//   const { results, loading, error } = useResults(league?.sports);
//
// Returns:
//   results  — { [sportCode]: { champion, runner_up, semifinals[], quarterfinalists[], is_complete, season } }
//   loading  — true while any fetch is in flight
//   error    — Error object if the fetch failed, null otherwise

import { useState, useEffect, useCallback } from 'react';
import { fetchAllResults } from './resultsApi';

export function useResults(sportCodes) {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Use a stable key to avoid re-fetching on every render
  const key = Array.isArray(sportCodes) ? [...sportCodes].sort().join(',') : '';

  useEffect(() => {
    if (!key) return;
    setLoading(true);
    setError(null);
    fetchAllResults(sportCodes)
      .then(data => {
        setResults(data);
      })
      .catch(err => {
        setError(err);
      })
      .finally(() => {
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryCount]);

  const retryResults = useCallback(() => {
    setError(null); // Clear stale error immediately so UI can show "retrying" state
    setRetryCount(c => c + 1);
  }, []);

  return { results, loading, error, retryResults };
}
