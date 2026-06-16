import { useCallback, useEffect, useState } from 'react';
import {
  fetchYoutubeVideoStatuses,
  prioritizeVipVideos,
  type VipVideoItemStatus,
} from '../api/vip-video';

export type VipVideoTrack = {
  videoId: string;
  title: string;
  channelTitle?: string | null;
  thumbnailUrl?: string | null;
};

export function useVipVideoPlayback() {
  const [current, setCurrent] = useState<VipVideoTrack | null>(null);
  const [status, setStatus] = useState<VipVideoItemStatus>('pending');
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const play = useCallback((track: VipVideoTrack) => {
    setCurrent(track);
    setStatus('pending');
    setStreamUrl(null);
    setErrorCode(null);
    void prioritizeVipVideos([{ videoId: track.videoId, title: track.title }]).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!current) return;

    let cancelled = false;
    let timer: number | undefined;

    const stopPolling = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const refresh = async () => {
      try {
        const items = await fetchYoutubeVideoStatuses([current.videoId]);
        const data = items[0];
        if (cancelled || !data) return;
        setStatus(data.status);
        setStreamUrl(data.streamUrl);
        setErrorCode(data.errorCode);
        if ((data.status === 'ready' && data.streamUrl) || data.status === 'failed') {
          stopPolling();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'vip_forbidden' || msg === 'unauthorized' || msg === 'session_invalid') {
          if (!cancelled) {
            setStatus('failed');
            setErrorCode(msg);
            stopPolling();
          }
        }
      }
    };

    void refresh();
    timer = window.setInterval(() => {
      void refresh();
    }, 2000);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [current?.videoId]);

  const isReady = status === 'ready' && Boolean(streamUrl);

  return {
    current,
    status,
    streamUrl,
    errorCode,
    isReady,
    play,
    clear: () => setCurrent(null),
  };
}
