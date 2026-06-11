ALTER TABLE blobs ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS uploaded_by text;
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS updated_by text;

UPDATE blobs SET updated_at = created_at WHERE updated_at IS NULL;
