import { describe, expect, it } from 'vitest';
import { resolveYtdlpPath } from './youtube-audio-extract.js';

describe('resolveYtdlpPath', () => {
  it('falls back to PATH when a Mac Homebrew path is missing', () => {
    expect(resolveYtdlpPath('/opt/homebrew/bin/yt-dlp')).not.toBe(
      '/opt/homebrew/bin/yt-dlp',
    );
  });
});
