-- Migration: draft_reminders table + OTC preference helper
-- Run this in Supabase SQL Editor before deploying the send-otc-email
-- and check-timer-reminders Edge Functions.

-- ============================================================
-- STEP 1: draft_reminders — deduplication for reminder emails
-- ============================================================
CREATE TABLE IF NOT EXISTS draft_reminders (
  league_id    UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  pick_number  INTEGER NOT NULL,
  reminder_type TEXT   NOT NULL DEFAULT '1h',
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (league_id, pick_number, reminder_type)
);

-- Only the service role (Edge Functions) reads/writes this table.
ALTER TABLE draft_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON draft_reminders USING (true) WITH CHECK (true);

-- ============================================================
-- STEP 2: get_user_otc_pref — read OTC preference from auth.users
-- Edge Functions call this via RPC with the service role client.
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_otc_pref(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT COALESCE((raw_user_meta_data->>'receive_otc_emails')::boolean, true)
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;
$$;

-- ============================================================
-- STEP 3: Schedule cron job (run after enabling pg_cron)
-- Uncomment and replace placeholders, then run in SQL Editor.
-- Required secrets: supabase secrets set APP_URL=https://yourapp.com
-- ============================================================
-- SELECT cron.schedule(
--   'timer-reminder-check',
--   '*/15 * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://nrxfyxipvwvodalxkkqp.supabase.co/functions/v1/check-timer-reminders',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );
