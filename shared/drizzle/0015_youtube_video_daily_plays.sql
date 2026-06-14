CREATE TABLE IF NOT EXISTS youtube_video_daily_plays (
  play_date date NOT NULL,
  youtube_video_id text NOT NULL,
  title text NOT NULL,
  channel_title text,
  play_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (play_date, youtube_video_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS youtube_video_daily_plays_date_count_idx
  ON youtube_video_daily_plays (play_date, play_count DESC);
