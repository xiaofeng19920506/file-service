ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS show_pre_service_chair_name boolean NOT NULL DEFAULT false;
