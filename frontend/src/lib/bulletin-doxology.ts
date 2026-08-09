/** 本堂默认三一颂：https://www.youtube.com/watch?v=89zSBB5RUuM */
export const DEFAULT_DOXOLOGY_YOUTUBE_VIDEO_ID = '89zSBB5RUuM';

export const DEFAULT_DOXOLOGY_YOUTUBE_URL = `https://www.youtube.com/watch?v=${DEFAULT_DOXOLOGY_YOUTUBE_VIDEO_ID}`;

export function resolveDoxologyYoutubeVideoId(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  return trimmed || DEFAULT_DOXOLOGY_YOUTUBE_VIDEO_ID;
}
