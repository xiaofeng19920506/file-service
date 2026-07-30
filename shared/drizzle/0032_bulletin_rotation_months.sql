ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS rotation_start_month text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rotation_end_month text NOT NULL DEFAULT '';
