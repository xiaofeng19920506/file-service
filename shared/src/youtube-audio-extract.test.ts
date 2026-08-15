import { describe, expect, it } from 'vitest';
import { parseYtdlpProgressLine, resolveYtdlpPath } from './youtube-audio-extract.js';

describe('resolveYtdlpPath', () => {
  it('falls back to PATH when a Mac Homebrew path is missing', () => {
    expect(resolveYtdlpPath('/opt/homebrew/bin/yt-dlp')).not.toBe(
      '/opt/homebrew/bin/yt-dlp',
    );
  });
});

describe('parseYtdlpProgressLine', () => {
  it('reads download percent', () => {
    expect(parseYtdlpProgressLine('[download]  12.4% of  50.00MiB at  1.20MiB/s')).toEqual({
      percent: 12.4,
      stage: 'downloading',
    });
  });

  it('reads merge stage', () => {
    expect(parseYtdlpProgressLine('[Merger] Merging formats into "video.mp4"')?.stage).toBe(
      'merging',
    );
  });
});
