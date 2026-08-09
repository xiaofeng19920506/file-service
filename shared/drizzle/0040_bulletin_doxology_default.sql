-- 本堂默认三一颂：https://www.youtube.com/watch?v=89zSBB5RUuM
ALTER TABLE weekly_bulletins
  ALTER COLUMN doxology_youtube_video_id SET DEFAULT '89zSBB5RUuM';

UPDATE weekly_bulletins
SET doxology_youtube_video_id = '89zSBB5RUuM'
WHERE trim(coalesce(doxology_youtube_video_id, '')) = '';
