-- 本週金句（幻灯片第 35 页），支持主日现场实时更新

ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS verse_of_week text NOT NULL DEFAULT '';
