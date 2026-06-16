import { describe, expect, it } from 'vitest';
import {
  classifyYtdlpError,
  isRetryableYtdlpError,
  ytdlpSharedArgs,
} from './ytdlp-common.js';

describe('isRetryableYtdlpError', () => {
  it('detects 403', () => {
    expect(isRetryableYtdlpError('HTTP Error 403: Forbidden')).toBe(true);
  });

  it('ignores generic failures', () => {
    expect(isRetryableYtdlpError('video_extract_failed')).toBe(false);
  });
});

describe('classifyYtdlpError', () => {
  it('maps 403 to youtube_download_forbidden', () => {
    expect(classifyYtdlpError('ERROR: HTTP Error 403: Forbidden')).toBe(
      'youtube_download_forbidden',
    );
  });
});

describe('ytdlpSharedArgs', () => {
  it('includes retry flags', () => {
    expect(ytdlpSharedArgs('android,web')).toContain('--retries');
    expect(ytdlpSharedArgs('android,web').join(' ')).toContain('player_client=android,web');
  });
});
