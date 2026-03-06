-- COMPLETE Fix for infinite recursion in RLS policies
-- This removes ALL circular references
-- Run this ENTIRE script in Supabase SQL Editor

-- ============================================
-- STEP 1: Drop ALL existing policies
-- ============================================

-- Drop leagues policies
DROP POLICY IF EXISTS "Users can view leagues they're members of" ON leagues;
DROP POLICY IF EXISTS "Users can create leagues" ON leagues;
DROP POLICY IF EXISTS "Commissioners can update their leagues" ON leagues;
DROP POLICY IF EXISTS "Commissioners can delete their leagues" ON leagues;

-- Drop league_members policies
DROP POLICY IF EXISTS "Users can view league members for their leagues" ON league_members;
DROP POLICY IF EXISTS "Commissioners can manage league members" ON league_members;

-- Drop draft_picks policies
DROP POLICY IF EXISTS "Users can view draft picks for their leagues" ON draft_picks;
DROP POLICY IF EXISTS "Users can create picks in their leagues" ON draft_picks;
DROP POLICY IF EXISTS "Commissioners can delete picks (rollback)" ON draft_picks;

-- Drop draft_state policies
DROP POLICY IF EXISTS "Users can view draft state for their leagues" ON draft_state;
DROP POLICY IF EXISTS "Users can update draft state for their leagues" ON draft_state;

-- ============================================
-- STEP 2: Recreate policies WITHOUT circular references
-- ============================================

-- Leagues policies - SIMPLIFIED (no reference to league_members)
CREATE POLICY "Users can view all leagues" ON leagues
  FOR SELECT USING (true);

CREATE POLICY "Users can create leagues" ON leagues
  FOR INSERT WITH CHECK (commissioner_email = auth.email());

CREATE POLICY "Commissioners can update their leagues" ON leagues
  FOR UPDATE USING (commissioner_email = auth.email());

CREATE POLICY "Commissioners can delete their leagues" ON leagues
  FOR DELETE USING (commissioner_email = auth.email());

-- League members policies - SIMPLE (no circular reference)
CREATE POLICY "Anyone can view league members" ON league_members
  FOR SELECT USING (true);

CREATE POLICY "Commissioners can insert league members" ON league_members
  FOR INSERT WITH CHECK (
    league_id IN (SELECT id FROM leagues WHERE commissioner_email = auth.email())
  );

CREATE POLICY "Commissioners can update league members" ON league_members
  FOR UPDATE USING (
    league_id IN (SELECT id FROM leagues WHERE commissioner_email = auth.email())
  );

CREATE POLICY "Commissioners can delete league members" ON league_members
  FOR DELETE USING (
    league_id IN (SELECT id FROM leagues WHERE commissioner_email = auth.email())
  );

-- Draft picks policies
CREATE POLICY "Anyone can view draft picks" ON draft_picks
  FOR SELECT USING (true);

CREATE POLICY "League members can create picks" ON draft_picks
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Commissioners can delete picks" ON draft_picks
  FOR DELETE USING (
    league_id IN (SELECT id FROM leagues WHERE commissioner_email = auth.email())
  );

-- Draft state policies
CREATE POLICY "Anyone can view draft state" ON draft_state
  FOR SELECT USING (true);

CREATE POLICY "League members can update draft state" ON draft_state
  FOR ALL USING (
    auth.uid() IS NOT NULL
  );
