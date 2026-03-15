-- Migration: Add manual_pick_paused_until to draft_state
-- Run this in Supabase SQL Editor

ALTER TABLE draft_state
ADD COLUMN IF NOT EXISTS manual_pick_paused_until TIMESTAMPTZ;
