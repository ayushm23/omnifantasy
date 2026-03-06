import { useState, useEffect } from 'react';
import { fetchAllExpectedPoints } from './oddsApi';

/**
 * React hook that fetches expected points for an array of sport codes.
 * Returns { expectedPoints, loading, error } where expectedPoints is:
 * { sportCode: { 'Team Name': expectedPoints, ... }, ... }
 *
 * Caches results in Supabase (via oddsApi.js) and deduplicates fetches.
 * error is null on success, or an Error object if the fetch failed.
 */
export function useExpectedPoints(sportCodes) {
  const [expectedPoints, setExpectedPoints] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const key = Array.isArray(sportCodes) ? [...sportCodes].sort().join(',') : '';

  useEffect(() => {
    if (!sportCodes || sportCodes.length === 0 || !key) return;

    setLoading(true);
    setError(null);
    fetchAllExpectedPoints(sportCodes)
      .then(data => {
        setExpectedPoints(data);
      })
      .catch(err => {
        setError(err);
      })
      .finally(() => setLoading(false));
  }, [key, refreshNonce]); // re-run when sports set changes or manual refresh requested

  const refreshExpectedPoints = () => setRefreshNonce((n) => n + 1);

  return { expectedPoints, loading, error, refreshExpectedPoints };
}
