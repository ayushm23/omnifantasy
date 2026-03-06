-- Add Third Round Reversal support to draft_state
ALTER TABLE draft_state
ADD COLUMN IF NOT EXISTS third_round_reversal BOOLEAN NOT NULL DEFAULT false;
