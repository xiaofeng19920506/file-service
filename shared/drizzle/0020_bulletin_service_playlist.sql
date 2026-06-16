ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS service_playlist_id uuid REFERENCES playlists(id) ON DELETE SET NULL;
