import { describe, expect, it } from 'vitest';
import { parseBulletinRealtimeEvent } from './bulletin-realtime.js';

describe('parseBulletinRealtimeEvent', () => {
  it('parses updated and playlist_updated', () => {
    expect(
      parseBulletinRealtimeEvent(
        JSON.stringify({
          type: 'updated',
          bulletinId: 'b1',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ),
    ).toEqual({
      type: 'updated',
      bulletinId: 'b1',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(
      parseBulletinRealtimeEvent(
        JSON.stringify({
          type: 'playlist_updated',
          bulletinId: 'b1',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ),
    ).toEqual({
      type: 'playlist_updated',
      bulletinId: 'b1',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('rejects invalid payloads', () => {
    expect(parseBulletinRealtimeEvent('{"type":"nope"}')).toBeNull();
    expect(parseBulletinRealtimeEvent('not-json')).toBeNull();
  });
});
