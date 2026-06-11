CREATE TABLE IF NOT EXISTS playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  source_url text NOT NULL,
  youtube_playlist_id text,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS playlists_created_by_idx ON playlists (created_by_user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  title text NOT NULL,
  youtube_video_id text NOT NULL,
  youtube_url text NOT NULL,
  blob_id uuid REFERENCES blobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS playlist_items_playlist_order_idx
  ON playlist_items (playlist_id, sort_order);
