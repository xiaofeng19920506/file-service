import { useCallback, useEffect, useState } from 'react';
import {
  fetchYoutubeVideoStatus,
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

    const refresh = async () => {
      try {
        const data = await fetchYoutubeVideoStatus(current.videoId);
        if (cancelled) return;
        setStatus(data.status);
        setStreamUrl(data.streamUrl);
        setErrorCode(data.errorCode);
      } catch {
        if (!cancelled) setStatus('failed');
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
