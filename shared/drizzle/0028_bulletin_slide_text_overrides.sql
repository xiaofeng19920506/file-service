ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS slide_text_overrides jsonb NOT NULL DEFAULT '[]'::jsonb;
