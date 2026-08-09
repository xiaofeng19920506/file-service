ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS doxology_youtube_video_id text NOT NULL DEFAULT '';
