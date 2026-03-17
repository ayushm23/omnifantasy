-- Migration: draft_queue and draft_member_settings tables
-- draft_queue: per-user ordered list of teams to draft (queue for autopick)
-- draft_member_settings: per-user per-league personal draft preferences

-- ─── Draft Queue ─────────────────────────────────────────────────────────────
-- Stores each user's ordered wish-list of sport+team picks for a league draft.
-- Autopick (timer expiry or immediate) uses this order before falling back to highest-EP.

CREATE TABLE IF NOT EXISTS draft_queue (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  sport      TEXT NOT NULL,
  team       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (league_id, user_email, sport, team)
);

ALTER TABLE draft_queue ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read any queue (commissioner needs to see current
-- picker's queue to execute queue-aware autopick on their behalf).
CREATE POLICY "Queue readable by authenticated"
  ON draft_queue FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Queue writable by owner"
  ON draft_queue FOR INSERT
  WITH CHECK (auth.jwt()->>'email' = user_email);

CREATE POLICY "Queue updatable by owner"
  ON draft_queue FOR UPDATE
  USING (auth.jwt()->>'email' = user_email);

CREATE POLICY "Queue deletable by owner"
  ON draft_queue FOR DELETE
  USING (auth.jwt()->>'email' = user_email);

-- ─── Member Settings ─────────────────────────────────────────────────────────
-- Per-user per-league draft preferences.
--   auto_pick_from_queue: immediately pick from queue only when it's their turn
--   receive_otc_emails: opt-out of on-the-clock email notifications (stub — no emails sent yet)
--   auto_pick_general: added in a later migration (queue first, then EP fallback)

CREATE TABLE IF NOT EXISTS draft_member_settings (
  league_id            UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_email           TEXT NOT NULL,
  auto_pick_from_queue BOOLEAN NOT NULL DEFAULT false,
  receive_otc_emails   BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (league_id, user_email)
);

ALTER TABLE draft_member_settings ENABLE ROW LEVEL SECURITY;

-- Readable by all authenticated (commissioner needs to see picker settings for autopick logic).
CREATE POLICY "Settings readable by authenticated"
  ON draft_member_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Settings writable by owner"
  ON draft_member_settings FOR INSERT
  WITH CHECK (auth.jwt()->>'email' = user_email);

CREATE POLICY "Settings updatable by owner"
  ON draft_member_settings FOR UPDATE
  USING (auth.jwt()->>'email' = user_email);
