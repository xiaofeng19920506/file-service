-- Add worship song metadata fields to blobs
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS composer text;
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS author text;
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS notes text;
