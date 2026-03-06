-- Migration: sport_results table
-- Stores final results for each sport/season, shared across all users.
-- Results are fetched automatically from external APIs (ESPN, Jolpica).
-- Caching strategy: 30-day TTL once is_complete=true, 4-hour TTL while in progress.

CREATE TABLE IF NOT EXISTS sport_results (
  sport_code TEXT NOT NULL,
  season     INTEGER NOT NULL,
  results    JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sport_code, season)
);

ALTER TABLE sport_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Results readable by all"
  ON sport_results FOR SELECT USING (true);

CREATE POLICY "Results writable by authenticated"
  ON sport_results FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Results updatable by authenticated"
  ON sport_results FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Results JSONB schema examples:
--
-- Single-event sport (NFL, NBA, MLB, NHL, NCAAF, NCAAMB, UCL, WorldCup, Euro):
-- {
--   "champion": "Kansas City Chiefs",
--   "runner_up": "Philadelphia Eagles",
--   "semifinals": ["San Francisco 49ers", "Baltimore Ravens"],
--   "quarterfinalists": ["Detroit Lions", "Buffalo Bills", "Houston Texans", "Green Bay Packers"],
--   "is_complete": true,
--   "season": 2025
-- }
--
-- Multi-event sport (Golf, MensTennis, WomensTennis) — awarded only when all 4 events complete:
-- {
--   "events": [
--     {
--       "name": "Masters",
--       "champion": "Scottie Scheffler",
--       "runner_up": "Rory McIlroy",
--       "semifinals": ["Collin Morikawa", "Bryson DeChambeau"],
--       "quarterfinalists": ["Jon Rahm", "Viktor Hovland", "Xander Schauffele", "Patrick Cantlay"],
--       "is_complete": true
--     }
--   ],
--   "is_complete": false,
--   "season": 2026
-- }
--
-- F1 (uses season standings order):
-- {
--   "standings": ["Max Verstappen", "Lando Norris", "Charles Leclerc", ...20 drivers],
--   "is_complete": true,
--   "season": 2026
-- }
