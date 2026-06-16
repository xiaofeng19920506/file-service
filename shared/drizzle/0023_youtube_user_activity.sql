CREATE TABLE IF NOT EXISTS youtube_user_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  youtube_video_id text NOT NULL,
  title text NOT NULL,
  channel_title text,
  played_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS youtube_user_plays_user_played_at_idx
  ON youtube_user_plays (user_id, played_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS youtube_user_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query text NOT NULL,
  searched_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS youtube_user_searches_user_searched_at_idx
  ON youtube_user_searches (user_id, searched_at DESC);
