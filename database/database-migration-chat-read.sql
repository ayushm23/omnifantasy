-- Migration: add chat_last_read_at to league_members for cross-device unread sync
-- Run in Supabase SQL Editor

ALTER TABLE league_members
  ADD COLUMN IF NOT EXISTS chat_last_read_at TIMESTAMPTZ;
