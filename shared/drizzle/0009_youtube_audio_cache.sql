CREATE TABLE IF NOT EXISTS youtube_audio_cache (
  youtube_video_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending',
  blob_id uuid REFERENCES blobs(id) ON DELETE SET NULL,
  title text,
  error_code text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS youtube_audio_cache_status_idx ON youtube_audio_cache (status);
