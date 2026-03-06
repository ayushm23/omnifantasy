-- Migration: league_chat table for per-league real-time chat
-- Run this in Supabase SQL Editor after database-migration-ep-history.sql

CREATE TABLE IF NOT EXISTS league_chat (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  message    TEXT NOT NULL CHECK (char_length(message) >= 1 AND char_length(message) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast per-league message queries ordered by time
CREATE INDEX IF NOT EXISTS idx_league_chat_league_created
  ON league_chat (league_id, created_at ASC);

ALTER TABLE league_chat ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all chat messages
CREATE POLICY "Chat readable by authenticated"
  ON league_chat FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can only insert messages as themselves
CREATE POLICY "Chat insertable by sender"
  ON league_chat FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.jwt()->>'email' = user_email);
