CREATE TABLE IF NOT EXISTS youtube_video_lyrics (
  youtube_video_id text NOT NULL,
  language text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  source text,
  title text,
  cues jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (youtube_video_id, language)
);

CREATE INDEX IF NOT EXISTS youtube_video_lyrics_status_idx
  ON youtube_video_lyrics (status, updated_at);
