ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS service_roster_today_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_roster_next_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_roster_chair text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_roster_worship text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_roster_usher text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_roster_clean_names text NOT NULL DEFAULT '';
