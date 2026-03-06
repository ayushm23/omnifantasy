-- Migration: Add odds_cache table for storing expected points data
-- This reduces API calls to The Odds API by caching results in the database
-- All users share the same cached data; refreshes every 14 days

CREATE TABLE IF NOT EXISTS odds_cache (
  sport_code TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow anyone to read cached odds
CREATE POLICY "Anyone can view odds cache"
  ON odds_cache FOR SELECT
  USING (true);

-- Allow any authenticated user to insert/update odds cache
CREATE POLICY "Authenticated users can insert odds cache"
  ON odds_cache FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update odds cache"
  ON odds_cache FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Enable RLS
ALTER TABLE odds_cache ENABLE ROW LEVEL SECURITY;

-- Add to realtime (optional, not critical for odds cache)
-- ALTER PUBLICATION supabase_realtime ADD TABLE odds_cache;
