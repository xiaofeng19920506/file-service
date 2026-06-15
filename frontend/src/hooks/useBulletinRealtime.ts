import { useEffect, useRef } from 'react';
import { getAuthToken } from '../lib/auth-session';

export type BulletinRealtimeEvent = {
  type: 'updated';
  bulletinId: string;
  updatedAt: string;
};

const base = process.env.NEXT_PUBLIC_API_URL ?? '';

export function bulletinEventsUrl(bulletinId: string): string | null {
  const token = getAuthToken();
  if (!token) return null;
  const params = new URLSearchParams({ access_token: token });
  return `${base}/v1/bulletins/${encodeURIComponent(bulletinId)}/events?${params.toString()}`;
}

export function useBulletinRealtime(
  bulletinId: string | null | undefined,
  onUpdate: (event: BulletinRealtimeEvent) => void,
  enabled = true,
): void {
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || !bulletinId) return;
    const url = bulletinEventsUrl(bulletinId);
    if (!url) return;

    const es = new EventSource(url);
    const onBulletin = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as BulletinRealtimeEvent;
        if (data?.type === 'updated' && data.bulletinId === bulletinId) {
          handlerRef.current(data);
        }
      } catch {
        // ignore malformed events
      }
    };

    es.addEventListener('bulletin', onBulletin as EventListener);
    es.onerror = () => {
      // EventSource auto-reconnects; no user-facing error
    };

    return () => {
      es.removeEventListener('bulletin', onBulletin as EventListener);
      es.close();
    };
  }, [bulletinId, enabled]);
}
