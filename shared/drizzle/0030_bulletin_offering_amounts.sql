ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS offering_tithe_amount text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS offering_other_amount text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS offering_total_amount text NOT NULL DEFAULT '';
