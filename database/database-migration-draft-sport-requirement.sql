-- Add per-draft toggle for requiring one pick from each sport
ALTER TABLE draft_state
ADD COLUMN IF NOT EXISTS draft_every_sport_required BOOLEAN NOT NULL DEFAULT true;
