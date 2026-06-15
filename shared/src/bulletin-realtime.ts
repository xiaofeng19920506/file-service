export const BULLETIN_REALTIME_CHANNEL_PREFIX = 'bulletin:';

export type BulletinRealtimeEvent = {
  type: 'updated';
  bulletinId: string;
  updatedAt: string;
};

export function bulletinRealtimeChannel(bulletinId: string): string {
  return `${BULLETIN_REALTIME_CHANNEL_PREFIX}${bulletinId}:events`;
}

export function parseBulletinRealtimeEvent(raw: string): BulletinRealtimeEvent | null {
  try {
    const data = JSON.parse(raw) as BulletinRealtimeEvent;
    if (data?.type !== 'updated' || !data.bulletinId || !data.updatedAt) return null;
    return data;
  } catch {
    return null;
  }
}
