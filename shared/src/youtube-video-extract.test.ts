import { describe, expect, it } from 'vitest';
import {
  shouldUseProgressiveVideoDownload,
  YOUTUBE_VIDEO_MAX_HEIGHT,
  YOUTUBE_VIDEO_YTDLP_FORMAT,
} from './youtube-video-extract.js';
import { DEFAULT_YOUTUBE_VIDEO_PROGRESSIVE_BYTES } from './youtube-video-storage.js';

describe('YOUTUBE_VIDEO_YTDLP_FORMAT', () => {
  it('only allows H.264 video codecs for browser playback', () => {
    expect(YOUTUBE_VIDEO_MAX_HEIGHT).toBe(1080);
    expect(YOUTUBE_VIDEO_YTDLP_FORMAT).toContain('avc1');
    expect(YOUTUBE_VIDEO_YTDLP_FORMAT).toContain('vcodec^=avc');
    expect(YOUTUBE_VIDEO_YTDLP_FORMAT).toContain('[height<=1080]');
    expect(YOUTUBE_VIDEO_YTDLP_FORMAT).not.toMatch(/\/best\[height<=\d+\]$/);
  });
});

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
