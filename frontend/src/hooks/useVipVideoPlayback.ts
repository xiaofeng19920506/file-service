import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchYoutubeVideoStatus,
  fetchYoutubeVideoStatuses,
  prioritizeVipVideos,
  type VipVideoItemStatus,
} from '../api/vip-video';

export type VipVideoTrack = {
  videoId: string;
  title: string;
  channelTitle?: string | null;
  thumbnailUrl?: string | null;
  cacheStatus?: VipVideoItemStatus | null;
};

const POLL_MS = 2000;
const MAX_POLL_ERRORS = 8;

async function loadVideoStatus(videoId: string) {
  try {
    const items = await fetchYoutubeVideoStatuses([videoId]);
    if (items[0]) return items[0];
  } catch {
    /* batch 失败时回退单条 GET */
  }
  return fetchYoutubeVideoStatus(videoId);
}

function isTerminalStatus(status: VipVideoItemStatus, streamUrl: string | null): boolean {
  return (status === 'ready' && Boolean(streamUrl)) || status === 'failed';
}

export function useVipVideoPlayback() {
  const [current, setCurrent] = useState<VipVideoTrack | null>(null);
  const [status, setStatus] = useState<VipVideoItemStatus>('pending');
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const pollErrorCountRef = useRef(0);
  const activeVideoIdRef = useRef<string | null>(null);

  const applyStatus = useCallback((data: {
    status: VipVideoItemStatus;
    streamUrl: string | null;
    errorCode: string | null;
  }) => {
    setStatus(data.status);
    setStreamUrl(data.streamUrl);
    setErrorCode(data.errorCode);
    pollErrorCountRef.current = 0;
  }, []);

  const play = useCallback((track: VipVideoTrack) => {
    pollErrorCountRef.current = 0;
    activeVideoIdRef.current = track.videoId;
    setCurrent(track);
    setErrorCode(null);
    const hinted = track.cacheStatus;
    if (hinted === 'ready' || hinted === 'processing' || hinted === 'failed') {
      setStatus(hinted);
    } else {
      setStatus('pending');
    }
    setStreamUrl(null);

    void prioritizeVipVideos([{ videoId: track.videoId, title: track.title }]).catch(() => undefined);

    void loadVideoStatus(track.videoId)
      .then((data) => {
        if (activeVideoIdRef.current !== track.videoId) return;
        applyStatus(data);
      })
      .catch((e) => {
        if (activeVideoIdRef.current !== track.videoId) return;
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'vip_forbidden' || msg === 'unauthorized' || msg === 'session_invalid') {
          setStatus('failed');
          setErrorCode(msg);
        }
      });
  }, [applyStatus]);

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
        const data = await loadVideoStatus(current.videoId);
        if (cancelled) return;
        applyStatus(data);
        if (isTerminalStatus(data.status, data.streamUrl)) {
          stopPolling();
        }
      } catch (e) {
        if (cancelled) return;
        pollErrorCountRef.current += 1;
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'vip_forbidden' || msg === 'unauthorized' || msg === 'session_invalid') {
          setStatus('failed');
          setErrorCode(msg);
          stopPolling();
          return;
        }
        if (pollErrorCountRef.current >= MAX_POLL_ERRORS) {
          setStatus('failed');
          setErrorCode('network_error');
          stopPolling();
        }
      }
    };

    void refresh();
    timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [applyStatus, current?.videoId]);

  const isReady = status === 'ready' && Boolean(streamUrl);

  const markPlaybackFailed = useCallback(() => {
    setStatus('failed');
    setErrorCode('video_playback_failed');
    setStreamUrl(null);
  }, []);

  const clear = useCallback(() => {
    activeVideoIdRef.current = null;
    setCurrent(null);
  }, []);

  return {
    current,
    status,
    streamUrl,
    errorCode,
    isReady,
    play,
    markPlaybackFailed,
    clear,
  };
}
