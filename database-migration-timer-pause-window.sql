-- Add configurable draft timer pause window (ET) to leagues
ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS timer_pause_start_hour INTEGER NOT NULL DEFAULT 0;

ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS timer_pause_end_hour INTEGER NOT NULL DEFAULT 8;
