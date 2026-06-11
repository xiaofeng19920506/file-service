-- Bilingual song titles: English + Simplified + Traditional Chinese
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS title_zh_cn text;
ALTER TABLE blobs ADD COLUMN IF NOT EXISTS title_zh_tw text;

-- Migrate legacy single title into simplified Chinese field
UPDATE blobs
SET title_zh_cn = title
WHERE title IS NOT NULL
  AND title_zh_cn IS NULL;
