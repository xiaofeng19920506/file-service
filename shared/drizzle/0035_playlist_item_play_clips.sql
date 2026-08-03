-- 一首歌可切多段：[{ "startSec": 0, "endSec": 45, "label": "前奏" }, ...]
ALTER TABLE playlist_items
  ADD COLUMN IF NOT EXISTS play_clips jsonb;

-- 把旧单段起止迁入 play_clips
UPDATE playlist_items
SET play_clips = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'startSec', COALESCE(play_start_sec, 0),
      'endSec', play_end_sec
    )
  )
)
WHERE play_clips IS NULL
  AND (play_start_sec IS NOT NULL OR play_end_sec IS NOT NULL);
