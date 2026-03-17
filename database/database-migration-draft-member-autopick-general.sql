-- Migration: Add auto_pick_general to draft_member_settings
-- Run this in Supabase SQL Editor

ALTER TABLE draft_member_settings
ADD COLUMN IF NOT EXISTS auto_pick_general BOOLEAN NOT NULL DEFAULT false;
