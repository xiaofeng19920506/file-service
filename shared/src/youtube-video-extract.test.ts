import { describe, expect, it } from 'vitest';
import { shouldUseProgressiveVideoDownload } from './youtube-video-extract.js';
import { DEFAULT_YOUTUBE_VIDEO_PROGRESSIVE_BYTES } from './youtube-video-storage.js';

describe('shouldUseProgressiveVideoDownload', () => {
  it('enables progressive for large files on fs storage', () => {
    expect(
      shouldUseProgressiveVideoDownload(
        DEFAULT_YOUTUBE_VIDEO_PROGRESSIVE_BYTES + 1,
        DEFAULT_YOUTUBE_VIDEO_PROGRESSIVE_BYTES,
        'fs',
      ),
    ).toBe(true);
  });

  it('disables progressive for small files', () => {
    expect(
      shouldUseProgressiveVideoDownload(1024, DEFAULT_YOUTUBE_VIDEO_PROGRESSIVE_BYTES, 'fs'),
    ).toBe(false);
  });

  it('disables progressive on s3 storage', () => {
    expect(
      shouldUseProgressiveVideoDownload(
        DEFAULT_YOUTUBE_VIDEO_PROGRESSIVE_BYTES * 2,
        DEFAULT_YOUTUBE_VIDEO_PROGRESSIVE_BYTES,
        's3',
      ),
    ).toBe(false);
  });
});
