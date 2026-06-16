ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS scripture_book text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS scripture_reference text NOT NULL DEFAULT '';
