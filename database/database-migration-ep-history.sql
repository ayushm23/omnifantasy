-- Migration: ep_history table for EP trend charts
-- Each row is a full snapshot of ALL teams' EP values for one sport at one point in time.
-- Written once per sport per odds cache refresh (~every 2 days).
-- Run this in the Supabase SQL Editor after database-migration-draft-queue.sql.

CREATE TABLE IF NOT EXISTS ep_history (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sport_code    TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,  -- { 'Team Name': ep_value, ... } for ALL teams at this moment
  captured_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ep_history_sport_captured
  ON ep_history (sport_code, captured_at DESC);

-- RLS: any authenticated user can SELECT or INSERT
-- (INSERT needed because any client may trigger an odds cache refresh)
ALTER TABLE ep_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ep_history_select" ON ep_history
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "ep_history_insert" ON ep_history
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
