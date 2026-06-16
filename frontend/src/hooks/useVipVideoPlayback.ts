import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchYoutubeVideoStatus,
  fetchYoutubeVideoStatuses,
  prioritizeVipVideos,
  type VipVideoItemStatus,
  type YoutubeVideoStatus,
} from '../api/vip-video';

export type VipVideoTrack = {
  videoId: string;
  title: string;
  channelTitle?: string | null;
  thumbnailUrl?: string | null;
  cacheStatus?: VipVideoItemStatus | null;
};

const POLL_MS = 2000;
const POLL_MS_PARTIAL = 1000;
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

function isTerminalStatus(data: YoutubeVideoStatus): boolean {
  if (data.status === 'failed') return true;
  if (data.status === 'ready' && data.streamUrl) return true;
  return false;
}

export function useVipVideoPlayback() {
  const [current, setCurrent] = useState<VipVideoTrack | null>(null);
  const [status, setStatus] = useState<VipVideoItemStatus>('pending');
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [cachedBytes, setCachedBytes] = useState<number | null>(null);
  const pollErrorCountRef = useRef(0);
  const activeVideoIdRef = useRef<string | null>(null);
  const cachedBytesRef = useRef(0);

  const applyStatus = useCallback((data: YoutubeVideoStatus) => {
    setStatus(data.status);
    setStreamUrl(data.streamUrl);
    setErrorCode(data.errorCode);
    setPartial(Boolean(data.partial));
    setCachedBytes(data.cachedBytes);
    if (typeof data.cachedBytes === 'number') {
      cachedBytesRef.current = data.cachedBytes;
    }
    pollErrorCountRef.current = 0;
  }, []);

  const play = useCallback((track: VipVideoTrack) => {
    pollErrorCountRef.current = 0;
    cachedBytesRef.current = 0;
    activeVideoIdRef.current = track.videoId;
    setCurrent(track);
    setErrorCode(null);
    setPartial(false);
    setCachedBytes(null);
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
        if (isTerminalStatus(data)) {
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
    const interval = partial ? POLL_MS_PARTIAL : POLL_MS;
    timer = window.setInterval(() => {
      void refresh();
    }, interval);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [applyStatus, current?.videoId, partial]);

  const isReady = Boolean(streamUrl);

  const refreshForMoreCache = useCallback(async () => {
    if (!current?.videoId || !partial) return;
    try {
      const data = await loadVideoStatus(current.videoId);
      if (activeVideoIdRef.current !== current.videoId) return;
      const prev = cachedBytesRef.current;
      applyStatus(data);
      return (data.cachedBytes ?? 0) > prev ? data : null;
    } catch {
      return null;
    }
  }, [applyStatus, current?.videoId, partial]);

  const markPlaybackFailed = useCallback(() => {
    setStatus('failed');
    setErrorCode('video_playback_failed');
    setStreamUrl(null);
    setPartial(false);
  }, []);

  const clear = useCallback(() => {
    activeVideoIdRef.current = null;
    cachedBytesRef.current = 0;
    setCurrent(null);
  }, []);

  return {
    current,
    status,
    streamUrl,
    errorCode,
    partial,
    cachedBytes,
    isReady,
    play,
    refreshForMoreCache,
    markPlaybackFailed,
    clear,
  };
}
