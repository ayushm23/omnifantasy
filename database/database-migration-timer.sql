-- Migration to add draft timer support
-- Run this in your Supabase SQL Editor

-- Add pick_started_at column to draft_state table
ALTER TABLE draft_state
ADD COLUMN IF NOT EXISTS pick_started_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing draft states to have a pick_started_at timestamp
UPDATE draft_state
SET pick_started_at = NOW()
WHERE pick_started_at IS NULL;
