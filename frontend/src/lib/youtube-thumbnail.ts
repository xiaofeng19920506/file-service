export type YoutubeThumbnailQuality =
  | 'default'
  | 'mqdefault'
  | 'hqdefault'
  | 'sddefault'
  | 'maxresdefault';

/** 经 API 代理的缩略图（国内无法直连 i.ytimg.com） */
export function youtubeThumbnailSrc(
  videoId: string,
  quality: YoutubeThumbnailQuality = 'mqdefault',
): string {
  return `/v1/youtube/thumbnails/${encodeURIComponent(videoId)}?quality=${quality}`;
}

export function resolveYoutubeThumbnailUrl(videoId: string, url?: string | null): string {
  if (!url) return youtubeThumbnailSrc(videoId);
  try {
    const host = new URL(url).hostname;
    if (host === 'i.ytimg.com' || host.endsWith('.ytimg.com')) {
      return youtubeThumbnailSrc(videoId);
    }
  } catch {
    /* 非 URL 字符串 */
  }
  return url;
}
