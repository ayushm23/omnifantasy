-- Migration: Add platform admins table
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Create admins table
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: RLS policies
-- Users can only read their own admin row
-- Inserts/updates/deletes are intended for service role only
-- ============================================
DROP POLICY IF EXISTS "Admins can read self" ON admins;

CREATE POLICY "Admins can read self" ON admins
  FOR SELECT USING (auth.email() = email);

-- ============================================
-- STEP 3: Seed initial admin(s)
-- ============================================
INSERT INTO admins (email)
VALUES (LOWER('ayushm23@gmail.com'))
ON CONFLICT (email) DO NOTHING;
