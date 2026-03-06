-- Migration: Add status column to league_members for invite/accept flow
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Add status column
-- ============================================
ALTER TABLE league_members
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'accepted', 'declined'));

-- ============================================
-- STEP 2: Backfill existing rows to 'accepted'
-- (Pre-feature leagues are implicitly accepted)
-- ============================================
UPDATE league_members SET status = 'accepted' WHERE status = 'pending';

-- ============================================
-- STEP 3: Allow members to update their own row
-- (Needed so members can accept or decline their invite)
-- Commissioner UPDATE policy already exists from database-setup.sql
-- ============================================
DROP POLICY IF EXISTS "Members can self-update status" ON league_members;

CREATE POLICY "Members can self-update status" ON league_members
  FOR UPDATE USING (
    email = auth.email()
  );
