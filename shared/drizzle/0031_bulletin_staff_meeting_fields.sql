ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS staff_meeting_year text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS staff_meeting_month text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS staff_meeting_start_time text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS staff_meeting_end_time text NOT NULL DEFAULT '';
