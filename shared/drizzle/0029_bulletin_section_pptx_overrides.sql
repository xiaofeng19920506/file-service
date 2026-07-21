ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS section_pptx_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
