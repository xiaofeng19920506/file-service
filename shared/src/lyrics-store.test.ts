import { describe, expect, it } from 'vitest';
import type { YoutubeVideoLyricsRow } from './db/schema.js';
import { shouldEnqueueLyricsJob } from './lyrics-store.js';

function row(partial: Partial<YoutubeVideoLyricsRow>): YoutubeVideoLyricsRow {
  return {
    youtubeVideoId: 'abcdefghijk',
    language: 'zh',
    status: 'pending',
    source: null,
    title: 'test',
    cues: [],
    errorCode: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  };
}

describe('shouldEnqueueLyricsJob', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');

  it('enqueues when nothing is stored', () => {
    expect(shouldEnqueueLyricsJob(null, now)).toBe(true);
  });

  it('does not enqueue ready lyrics', () => {
    expect(
      shouldEnqueueLyricsJob(
        row({
          status: 'ready',
          cues: [{ start: 0, end: 1, text: 'hello' }],
          updatedAt: new Date(now),
        }),
        now,
      ),
    ).toBe(false);
  });

  it('does not enqueue a fresh pending job', () => {
    expect(shouldEnqueueLyricsJob(row({ status: 'pending', updatedAt: new Date(now) }), now)).toBe(
      false,
    );
  });

  it('retries a stale pending job', () => {
    expect(
      shouldEnqueueLyricsJob(
        row({ status: 'pending', updatedAt: new Date(now - 13 * 60 * 1000) }),
        now,
      ),
    ).toBe(true);
  });

  it('retries failed lyrics after a day', () => {
    expect(
      shouldEnqueueLyricsJob(
        row({ status: 'failed', updatedAt: new Date(now - 25 * 60 * 60 * 1000) }),
        now,
      ),
    ).toBe(true);
    expect(
      shouldEnqueueLyricsJob(
        row({ status: 'failed', updatedAt: new Date(now - 60 * 60 * 1000) }),
        now,
      ),
    ).toBe(false);
  });
});
