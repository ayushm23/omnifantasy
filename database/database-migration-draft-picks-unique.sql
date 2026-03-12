-- Migration: unique constraint on draft_picks (league_id, pick_number)
-- Prevents double-picks when client-side auto-pick and server-side auto-pick
-- race to fill the same slot. The second attempt gets a unique violation and
-- is silently discarded.
--
-- Run in Supabase SQL Editor before deploying the auto-pick-from-queue Edge Function.

ALTER TABLE draft_picks
  ADD CONSTRAINT draft_picks_league_pick_unique
  UNIQUE (league_id, pick_number);
