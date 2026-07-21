ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS worship_lyrics_pptx_blob_id uuid
    REFERENCES blobs(id) ON DELETE SET NULL;
