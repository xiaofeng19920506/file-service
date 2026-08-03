ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS worship_presentation_mode text NOT NULL DEFAULT 'youtube';

ALTER TABLE playlist_items
  ADD COLUMN IF NOT EXISTS play_start_sec integer;

ALTER TABLE playlist_items
  ADD COLUMN IF NOT EXISTS play_end_sec integer;
