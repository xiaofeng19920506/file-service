/** 大文件启用边下边播的体积阈值（默认 40MB） */
export const DEFAULT_YOUTUBE_VIDEO_PROGRESSIVE_BYTES = 40 * 1024 * 1024;

/** 至少缓存这么多字节后才允许起播（默认 2MB） */
export const DEFAULT_YOUTUBE_VIDEO_STREAMABLE_MIN_BYTES = 2 * 1024 * 1024;

export function youtubeVideoPartialStorageKey(videoId: string): string {
  return `youtube-video/partial/${videoId}.mp4`;
}

export function partialVideoContentSha256(videoId: string): string {
  return `partial-${videoId}`;
}
