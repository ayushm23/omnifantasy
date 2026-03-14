-- Migration: Add issue_reports table (bug/feature submissions)
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Ensure UUID support
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- STEP 2: Create issue_reports table
-- ============================================
CREATE TABLE IF NOT EXISTS issue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  area TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triage', 'in_progress', 'resolved', 'closed')),
  reporter_email TEXT,
  reporter_name TEXT,
  league_id UUID REFERENCES leagues(id) ON DELETE SET NULL,
  view TEXT,
  user_agent TEXT,
  app_version TEXT
);

ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: RLS policies
-- Anyone authenticated can submit
-- Only admins can view/update
-- ============================================
DROP POLICY IF EXISTS "Issue reports insert by auth" ON issue_reports;
DROP POLICY IF EXISTS "Issue reports admin read" ON issue_reports;
DROP POLICY IF EXISTS "Issue reports admin update" ON issue_reports;

CREATE POLICY "Issue reports insert by auth" ON issue_reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Issue reports admin read" ON issue_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.email = auth.email())
  );

CREATE POLICY "Issue reports admin update" ON issue_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.email = auth.email())
  );
