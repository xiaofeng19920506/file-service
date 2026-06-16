ALTER TABLE youtube_video_cache
  ADD COLUMN IF NOT EXISTS expected_bytes bigint;
