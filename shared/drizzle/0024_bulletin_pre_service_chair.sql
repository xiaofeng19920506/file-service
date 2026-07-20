ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS pre_service_chair_names text NOT NULL DEFAULT '';
