-- Migration to add picker_name column to draft_picks table
-- Run this in your Supabase SQL Editor

ALTER TABLE draft_picks
ADD COLUMN IF NOT EXISTS picker_name TEXT;

-- Update existing picks to set picker_name from picker_email
UPDATE draft_picks
SET picker_name = SPLIT_PART(picker_email, '@', 1)
WHERE picker_name IS NULL;
