ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS weekly_meeting_templates jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS weekly_meeting_template_id text;
