import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { getYoutubeAudioStatus, getYoutubeAudioStreamUrl, requestYoutubeAudioExtract } from '../api/youtube-audio';
import type { YoutubeAudioStatus } from '../api/youtube-audio';
import { usePlaylistTrackLyrics, useActiveLyricLine } from '../hooks/usePlaylistTrackLyrics';
import { useI18n } from '../i18n';
import { friendlyError } from '../lib/error-messages';
import {
  readStoredPlayerVolume,
  writeStoredPlayerVolume,
} from '../lib/player-volume';
import {
  cacheHeardAudio,
  getHeardAudioCachedObjectUrl,
  shouldCacheHeardProgress,
} from '../lib/heard-audio-cache';
import {
  HEARD_AUDIO_CACHE_PREF_EVENT,
  readHeardAudioCacheEnabled,
} from '../lib/heard-audio-cache-preference';
import { useMediaSession } from '../hooks/useMediaSession';
import { useSwipeTrackNavigation } from '../hooks/useSwipeTrackNavigation';
import type { PlaylistPlaybackOrderMode } from '../lib/playlist-playback-order-mode';
import PlaylistKaraokeLyrics from './PlaylistKaraokeLyrics';
import PlaylistLyricsScroller from './PlaylistLyricsScroller';
import { PlaybackOrderModeIcon, PlusIcon, QueueIcon } from './icons';
import AudioSeekBar from './AudioSeekBar';
import ScrollingTitle from './ScrollingTitle';

export type PlaylistAudioItem = {
  youtubeVideoId: string;
  title: string;
  audio?: YoutubeAudioStatus;
};

type PlaylistAudioPlayerProps = {
  items: PlaylistAudioItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onAudioStatusChange?: (videoId: string, status: YoutubeAudioStatus) => void;
  onNextTrack?: () => void;
  onPrevTrack?: () => void;
  canGoNext?: boolean;
  canGoPrev?: boolean;
  onProgressUpdate?: (progress: PlaylistAudioProgressState) => void;
  progressHandleRef?: RefObject<PlaylistAudioProgressHandle | null>;
  /** 用于车载 / 锁屏 Media Session 显示的列表名 */
  playlistTitle?: string;
  variant?: 'default' | 'nowPlaying' | 'youtubeWatch' | 'desktopDock' | 'mobileRecord';
  /** 手机 YouTube 式页内布局（与视频播放器一致） */
  mobileInline?: boolean;
  repeatMode?: import('../lib/playlist-repeat-mode').PlaylistRepeatMode;
  playbackOrderMode?: PlaylistPlaybackOrderMode;
  onOpenPlaybackOrder?: () => void;
  playbackOrderOpen?: boolean;
  onToggleQueue?: () => void;
  queueOpen?: boolean;
  /** 试听：CD 右上角「添加到列表」icon */
  onAddToList?: () => void;
  /**
   * 真实下一曲（含 shuffle / 列表循环）。用于后台预加载流地址，
   * 以便 iOS 在 ended 回调内同步切 src+play（异步拉流在后台会被挂起）。
   */
  nextItem?: PlaylistAudioItem | null;
  /** 后续多首（含下一曲），优先于仅 nextItem 的单曲预取，支持后台连续连播 */
  upcomingItems?: PlaylistAudioItem[];
};

type PrefetchedStream = {
  videoId: string;
  url: string;
  preview: boolean;
  /** ready 流的网络地址（blob 播放时仍用它后台写入本机缓存） */
  networkUrl?: string | null;
};

function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPlaybackTimeRange(currentTime: number, duration: number): string {
  const total =
    Number.isFinite(duration) && duration > 0 ? formatPlaybackTime(duration) : '--:--';
  return `${formatPlaybackTime(currentTime)} / ${total}`;
}

export type PlaylistAudioProgressState = {
  currentTime: number;
  duration: number;
  canSeek: boolean;
  videoId?: string;
};

export type PlaylistAudioProgressHandle = {
  seekToRatio: (ratio: number) => void;
};

function resolveStreamSrc(url: string): string {
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/v1/')) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* fall through */
  }
  if (url.startsWith('http')) return url;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
  return `${base}${url}`;
}

function audioSrcMatchesStream(el: HTMLAudioElement, streamUrl: string | null): boolean {
  if (!streamUrl) return false;
  const current = el.currentSrc || el.getAttribute('src') || el.src || '';
  if (!current) return false;
  if (current === streamUrl) return true;
  try {
    const currentUrl = new URL(current, window.location.href);
    const expectedUrl = new URL(streamUrl, window.location.href);
    return currentUrl.pathname === expectedUrl.pathname && currentUrl.search === expectedUrl.search;
  } catch {
    return current.includes(streamUrl) || streamUrl.includes(current);
  }
}

function resetAudioElement(el: HTMLAudioElement | null) {
  if (!el) return;
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  try {
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
  try {
    el.removeAttribute('src');
    el.src = '';
    el.load();
  } catch {
    /* ignore */
  }
}

function VolumeIcon({ level, muted }: { level: number; muted: boolean }) {
  if (muted || level === 0) {
    return (
      <svg className="audio-volume-icon" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zM11.8 4.2 11 5l2 2-2 2 .8.8 2.8-2.8L14.6 6l-2.8-2.8zM9 6.4 10.6 8 9 9.6V6.4z"
        />
      </svg>
    );
  }
  if (level < 50) {
    return (
      <svg className="audio-volume-icon" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zm5.5 2.5a3.5 3.5 0 0 1 0 5v-1.5a2 2 0 0 0 0-2v-1.5z"
        />
      </svg>
    );
  }
  return (
    <svg className="audio-volume-icon" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zm5.5 2.5a3.5 3.5 0 0 1 0 5v-1.5a2 2 0 0 0 0-2v-1.5zm2-5a6.5 6.5 0 0 1 0 11v-1.5a5 5 0 0 0 0-8v-1.5z"
      />
    </svg>
  );
}

export default function PlaylistAudioPlayer({
  items,
  activeIndex,
  onActiveIndexChange,
  playing,
  onPlayingChange,
  onAudioStatusChange,
  onNextTrack,
  onPrevTrack,
  canGoNext,
  canGoPrev,
  onProgressUpdate,
  progressHandleRef,
  playlistTitle,
  variant = 'default',
  mobileInline = false,
  repeatMode = 'off',
  playbackOrderMode = 'sequential',
  onOpenPlaybackOrder,
  playbackOrderOpen = false,
  onToggleQueue,
  queueOpen = false,
  onAddToList,
  nextItem = null,
  upcomingItems,
}: PlaylistAudioPlayerProps) {
  const { t, locale } = useI18n();
  const isNowPlaying = variant === 'nowPlaying';
  const isYoutubeWatch = variant === 'youtubeWatch';
  const isDesktopDock = variant === 'desktopDock';
  const isMobileRecord = variant === 'mobileRecord';
  const audioRef = useRef<HTMLAudioElement>(null);
  const mobileSwipeRef = useRef<HTMLElement>(null);
  const volumeProgressRef = useRef<HTMLDivElement>(null);
  const wantPlayRef = useRef(playing);
  const skipPauseSyncRef = useRef(false);
  const endedHandledRef = useRef(false);
  const playbackTrackKeyRef = useRef('');
  const streamUrlRef = useRef<string | null>(null);
  const networkStreamUrlRef = useRef<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const heardCacheArmedRef = useRef<string | null>(null);
  const currentVideoIdRef = useRef('');
  const nextStreamRef = useRef<PrefetchedStream | null>(null);
  const seamlessHandoffRef = useRef<PrefetchedStream | null>(null);
  const skipStreamFetchVideoIdRef = useRef<string | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  /** 多首预缓冲缓存，支持后台连续切歌而不只再播一首 */
  const preloadCacheRef = useRef(new Map<string, PrefetchedStream>());
  const upcomingItemsRef = useRef<PlaylistAudioItem[]>([]);
  const usingPreviewRef = useRef(false);
  const progressNotifyRef = useRef(onProgressUpdate);
  progressNotifyRef.current = onProgressUpdate;

  const revokePlaybackBlobUrl = useCallback(() => {
    if (!blobUrlRef.current) return;
    try {
      URL.revokeObjectURL(blobUrlRef.current);
    } catch {
      /* ignore */
    }
    blobUrlRef.current = null;
  }, []);

  const resolvePlaybackSrc = useCallback(
    async (videoId: string, networkUrl: string, preview: boolean): Promise<string> => {
      if (preview || !readHeardAudioCacheEnabled()) return networkUrl;
      const cached = await getHeardAudioCachedObjectUrl(videoId);
      if (!cached) return networkUrl;
      if (currentVideoIdRef.current !== videoId) {
        try {
          URL.revokeObjectURL(cached);
        } catch {
          /* ignore */
        }
        return networkUrl;
      }
      return cached;
    },
    [],
  );

  const armHeardAudioCache = useCallback((videoId: string | null | undefined) => {
    if (!videoId || usingPreviewRef.current) return;
    if (!readHeardAudioCacheEnabled()) return;
    const networkUrl = networkStreamUrlRef.current;
    if (!networkUrl || networkUrl.startsWith('blob:')) return;
    if (heardCacheArmedRef.current === videoId) return;
    heardCacheArmedRef.current = videoId;
    void cacheHeardAudio(videoId, networkUrl);
  }, []);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [usingPreview, setUsingPreview] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [durationHint, setDurationHint] = useState(0);
  const [volume, setVolume] = useState(readStoredPlayerVolume);
  const [muted, setMuted] = useState(false);
  const volumeBeforeMuteRef = useRef(volume);
  const lyricsPanelRef = useRef<HTMLDivElement>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const scrubbingRef = useRef(false);

  const current = items[activeIndex];
  const resolvedUpcomingItems = useMemo(() => {
    if (upcomingItems && upcomingItems.length > 0) return upcomingItems;
    if (nextItem) return [nextItem];
    if (onNextTrack) return [] as PlaylistAudioItem[];
    if (repeatMode === 'one') return current ? [current] : [];
    const list: PlaylistAudioItem[] = [];
    if (activeIndex < items.length - 1) {
      for (let i = activeIndex + 1; i < items.length && list.length < 5; i++) {
        list.push(items[i]!);
      }
    }
    if (repeatMode === 'all' && list.length < 5) {
      for (let i = 0; i < activeIndex && list.length < 5; i++) {
        list.push(items[i]!);
      }
    }
    return list;
  }, [upcomingItems, nextItem, onNextTrack, repeatMode, current, activeIndex, items]);

  const resolvedNextItem = resolvedUpcomingItems[0] ?? null;
  upcomingItemsRef.current = resolvedUpcomingItems;
  const playbackTrackKey = `${activeIndex}:${current?.youtubeVideoId ?? ''}`;
  currentVideoIdRef.current = current?.youtubeVideoId ?? '';
  const [activeTrackKey, setActiveTrackKey] = useState(playbackTrackKey);
  if (activeTrackKey !== playbackTrackKey) {
    setActiveTrackKey(playbackTrackKey);
    scrubbingRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    setDurationHint(0);
    setPlayerError(null);
    const handoff = seamlessHandoffRef.current;
    if (handoff && handoff.videoId === current?.youtubeVideoId) {
      revokePlaybackBlobUrl();
      if (handoff.url.startsWith('blob:')) {
        blobUrlRef.current = handoff.url;
      }
      networkStreamUrlRef.current =
        handoff.preview ? null : (handoff.networkUrl ?? (handoff.url.startsWith('blob:') ? null : handoff.url));
      heardCacheArmedRef.current = null;
      streamUrlRef.current = handoff.url;
      setStreamUrl(handoff.url);
      setUsingPreview(handoff.preview);
      usingPreviewRef.current = handoff.preview;
      setLoadingStream(false);
      skipStreamFetchVideoIdRef.current = handoff.videoId;
    } else {
      seamlessHandoffRef.current = null;
      revokePlaybackBlobUrl();
      networkStreamUrlRef.current = null;
      heardCacheArmedRef.current = null;
      streamUrlRef.current = null;
      setStreamUrl(null);
      setUsingPreview(false);
      usingPreviewRef.current = false;
      setLoadingStream(true);
    }
  }
  const {
    captionCues,
    lyricsLoading,
    lyricsGenerating,
    lyricsError,
    subtitleLang,
    changeSubtitleLang,
  } = usePlaylistTrackLyrics({
    videoId: current?.youtubeVideoId,
    title: current?.title,
    locale,
  });
  const lyricsEmptyMessage = lyricsError
    ? t('errors.captions_fetch_failed')
    : t('playlists.noLyricsYet');
  const lyricsLoadingMessage = lyricsGenerating
    ? t('playlists.matchingLyrics')
    : t('playlists.loadingLyrics');

  useEffect(() => {
    setShowLyrics(false);
  }, [current?.youtubeVideoId]);

  useLayoutEffect(() => {
    const handoff = seamlessHandoffRef.current;
    if (handoff && handoff.videoId === current?.youtubeVideoId) {
      skipPauseSyncRef.current = true;
      const el = audioRef.current;
      if (el) {
        if (!audioSrcMatchesStream(el, handoff.url)) {
          el.src = handoff.url;
          el.load();
        }
        if (wantPlayRef.current) {
          void el.play().catch(() => undefined);
        }
      }
      seamlessHandoffRef.current = null;
      progressNotifyRef.current?.({
        currentTime: 0,
        duration: 0,
        canSeek: false,
        videoId: current?.youtubeVideoId,
      });
      return;
    }

    skipPauseSyncRef.current = true;
    resetAudioElement(audioRef.current);
    streamUrlRef.current = null;
    scrubbingRef.current = false;
    progressNotifyRef.current?.({
      currentTime: 0,
      duration: 0,
      canSeek: false,
      videoId: current?.youtubeVideoId,
    });
  }, [playbackTrackKey, current?.youtubeVideoId]);
  const audioStatus = current?.audio;
  const isReady = audioStatus?.status === 'ready';
  const isProcessing =
    audioStatus?.status === 'pending' || audioStatus?.status === 'processing';
  const playbackDuration = useMemo(() => {
    if (Number.isFinite(duration) && duration > 0 && duration !== Infinity) {
      return duration;
    }
    if (Number.isFinite(durationHint) && durationHint > 0) {
      return durationHint;
    }
    const lastCue = captionCues[captionCues.length - 1];
    if (lastCue && lastCue.end > 0) return lastCue.end;
    return 0;
  }, [duration, durationHint, captionCues]);
  const canSeek = playbackDuration > 0 && Boolean(streamUrl);
  const volumePct = muted ? 0 : volume;
  const activeCaption = useActiveLyricLine(captionCues, currentTime);

  useEffect(() => {
    wantPlayRef.current = playing;
  }, [playing]);

  useEffect(() => {
    usingPreviewRef.current = usingPreview;
  }, [usingPreview]);

  const refreshAudioStatus = useCallback(
    async (videoId: string) => {
      try {
        const status = await getYoutubeAudioStatus(videoId);
        if (
          typeof status.durationSeconds === 'number' &&
          Number.isFinite(status.durationSeconds) &&
          status.durationSeconds > 0
        ) {
          setDurationHint(status.durationSeconds);
        }
        onAudioStatusChange?.(videoId, status);
        return status;
      } catch {
        return null;
      }
    },
    [onAudioStatusChange],
  );

  const pickStreamFromStatus = useCallback(async (videoId: string, status: YoutubeAudioStatus) => {
    if (status.status === 'ready') {
      if (status.streamUrl) {
        return { url: status.streamUrl, preview: false };
      }
      try {
        const streamed = await getYoutubeAudioStreamUrl(videoId);
        return { url: streamed.url, preview: false };
      } catch {
        /* stream-url 不可用时回退 preview */
      }
    }
    if (status.previewStreamUrl) {
      return { url: status.previewStreamUrl, preview: true };
    }
    return null;
  }, []);

  const applyStreamUrl = useCallback(
    (url: string, preview: boolean, videoId?: string) => {
      const resolved = resolveStreamSrc(url);
      const trackId = videoId ?? currentVideoIdRef.current;
      networkStreamUrlRef.current = preview ? null : resolved;
      heardCacheArmedRef.current = null;

      if (preview || !trackId || !readHeardAudioCacheEnabled()) {
        revokePlaybackBlobUrl();
        streamUrlRef.current = resolved;
        setStreamUrl(resolved);
        setUsingPreview(preview);
        usingPreviewRef.current = preview;
        setLoadingStream(false);
        setPlayerError(null);
        return;
      }

      void (async () => {
        const playback = await resolvePlaybackSrc(trackId, resolved, false);
        if (currentVideoIdRef.current !== trackId) {
          if (playback.startsWith('blob:') && playback !== resolved) {
            try {
              URL.revokeObjectURL(playback);
            } catch {
              /* ignore */
            }
          }
          return;
        }
        revokePlaybackBlobUrl();
        if (playback.startsWith('blob:')) {
          blobUrlRef.current = playback;
        }
        streamUrlRef.current = playback;
        setStreamUrl(playback);
        setUsingPreview(false);
        usingPreviewRef.current = false;
        setLoadingStream(false);
        setPlayerError(null);
      })();
    },
    [resolvePlaybackSrc, revokePlaybackBlobUrl],
  );

  const replayCurrentTrackStream = useCallback(async () => {
    const videoId = current?.youtubeVideoId;
    if (!videoId) return;

    endedHandledRef.current = false;
    skipPauseSyncRef.current = true;
    playbackTrackKeyRef.current = '';

    try {
      const status = (await refreshAudioStatus(videoId)) ?? audioStatus;
      if (!status) return;
      const picked = await pickStreamFromStatus(videoId, status);
      if (!picked) return;
      applyStreamUrl(picked.url, picked.preview, videoId);
    } catch {
      /* 保持当前流，用户可手动重试 */
    }
  }, [
    current?.youtubeVideoId,
    audioStatus,
    refreshAudioStatus,
    pickStreamFromStatus,
    applyStreamUrl,
  ]);

  useEffect(() => {
    const videoId = current?.youtubeVideoId;
    if (!videoId || isReady) return;
    const timer = window.setInterval(() => {
      void refreshAudioStatus(videoId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [current?.youtubeVideoId, isReady, refreshAudioStatus]);

  useEffect(() => {
    const videoId = current?.youtubeVideoId;
    if (!videoId) {
      revokePlaybackBlobUrl();
      networkStreamUrlRef.current = null;
      heardCacheArmedRef.current = null;
      setStreamUrl(null);
      setUsingPreview(false);
      return;
    }

    if (skipStreamFetchVideoIdRef.current === videoId && streamUrlRef.current) {
      skipStreamFetchVideoIdRef.current = null;
      endedHandledRef.current = false;
      setStreamUrl(streamUrlRef.current);
      setLoadingStream(false);
      setPlayerError(null);
      return;
    }

    let cancelled = false;
    setLoadingStream(true);
    setPlayerError(null);
    setStreamUrl(null);
    setUsingPreview(false);
    setCurrentTime(0);
    setDuration(0);
    scrubbingRef.current = false;
    endedHandledRef.current = false;
    const hintedDuration =
      typeof audioStatus?.durationSeconds === 'number' &&
      Number.isFinite(audioStatus.durationSeconds) &&
      audioStatus.durationSeconds > 0
        ? audioStatus.durationSeconds
        : 0;
    setDurationHint(hintedDuration);

    void (async () => {
      try {
        let status = (await refreshAudioStatus(videoId)) ?? audioStatus;
        if (!status || cancelled) {
          if (!cancelled) setLoadingStream(false);
          return;
        }

        if (status.status === 'failed') {
          try {
            status = await requestYoutubeAudioExtract(videoId, current?.title);
            onAudioStatusChange?.(videoId, status);
          } catch {
            /* 仍尝试 preview */
          }
        }

        const picked = await pickStreamFromStatus(videoId, status);
        if (!picked || cancelled) {
          if (!cancelled) {
            if (status.status === 'failed') {
              setPlayerError(
                friendlyError(status.errorCode ?? 'audio_extract_failed', t),
              );
            }
            setLoadingStream(false);
          }
          return;
        }

        if (!cancelled) applyStreamUrl(picked.url, picked.preview, videoId);
      } catch (e) {
        if (!cancelled) {
          setPlayerError(
            friendlyError(e instanceof Error ? e.message : 'audio_not_ready', t),
          );
          setLoadingStream(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // activeIndex 确保同 videoId 的相邻曲目也会重新拉流
  }, [activeIndex, current?.youtubeVideoId]);

  // 轮询到 preview / ready 后补拉流（初次未就绪时 streamUrl 为空）
  useEffect(() => {
    const videoId = current?.youtubeVideoId;
    if (!videoId || streamUrl || loadingStream) return;
    const canPlay =
      audioStatus?.status === 'ready' ||
      audioStatus?.previewStreamUrl != null;
    if (!canPlay) return;

    let cancelled = false;
    setLoadingStream(true);

    void (async () => {
      try {
        const status = audioStatus ?? (await refreshAudioStatus(videoId));
        if (!status || cancelled) {
          if (!cancelled) setLoadingStream(false);
          return;
        }
        const picked = await pickStreamFromStatus(videoId, status);
        if (!picked || cancelled) {
          if (!cancelled) setLoadingStream(false);
          return;
        }
        if (!cancelled) applyStreamUrl(picked.url, picked.preview, videoId);
      } catch (e) {
        if (!cancelled) {
          setPlayerError(
            friendlyError(e instanceof Error ? e.message : 'audio_not_ready', t),
          );
          setLoadingStream(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    audioStatus?.status,
    audioStatus?.previewStreamUrl,
    audioStatus?.streamUrl,
    streamUrl,
    loadingStream,
    current?.youtubeVideoId,
    pickStreamFromStatus,
    refreshAudioStatus,
    applyStreamUrl,
    audioStatus,
    t,
  ]);

  // 后台缓存完成后从 preview 切到完整 MP3
  useEffect(() => {
    const videoId = current?.youtubeVideoId;
    if (!videoId || !usingPreview || !isReady) return;

    let cancelled = false;

    void (async () => {
      try {
        const status = (await refreshAudioStatus(videoId)) ?? audioStatus;
        if (!status || cancelled) return;
        const picked = await pickStreamFromStatus(videoId, status);
        if (!picked || picked.preview || cancelled) return;

        const el = audioRef.current;
        const savedTime = el?.currentTime ?? 0;
        const wasPlaying = wantPlayRef.current;

        if (!cancelled) applyStreamUrl(picked.url, false, videoId);

        if (el) {
          skipPauseSyncRef.current = true;
          const restore = () => {
            if (savedTime > 0.5) el.currentTime = savedTime;
            el.removeEventListener('loadedmetadata', restore);
            if (wasPlaying) void el.play().catch(() => {});
          };
          el.addEventListener('loadedmetadata', restore);
        }
      } catch {
        /* 继续用 preview */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    usingPreview,
    isReady,
    current?.youtubeVideoId,
    audioStatus,
    pickStreamFromStatus,
    refreshAudioStatus,
    applyStreamUrl,
  ]);

  const attemptPlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !streamUrl || !wantPlayRef.current) return;

    const playNow = () => {
      void el.play().catch(() => {
        if (!wantPlayRef.current) return;
        const onCanPlay = () => {
          el.removeEventListener('canplay', onCanPlay);
          if (wantPlayRef.current) void el.play().catch(() => {});
        };
        el.addEventListener('canplay', onCanPlay);
      });
    };

    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      playNow();
      return;
    }

    const onCanPlay = () => {
      el.removeEventListener('canplay', onCanPlay);
      playNow();
    };
    el.addEventListener('canplay', onCanPlay);
  }, [streamUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!playing) {
      el.pause();
      return;
    }
    if (!streamUrl) return;

    const trackKey = `${activeIndex}:${current?.youtubeVideoId ?? ''}`;
    const isNewTrack = trackKey !== playbackTrackKeyRef.current;
    if (isNewTrack) {
      playbackTrackKeyRef.current = trackKey;
      skipPauseSyncRef.current = true;
      // 无缝续播时 src 已在 ended 回调里切好并 play，再 load() 会打断 iOS 后台播放
      if (!audioSrcMatchesStream(el, streamUrl) || el.paused) {
        el.load();
      }
    } else {
      skipPauseSyncRef.current = true;
    }
    attemptPlay();
  }, [streamUrl, playing, attemptPlay, activeIndex, current?.youtubeVideoId]);

  useEffect(() => {
    endedHandledRef.current = false;
  }, [activeIndex, current?.youtubeVideoId]);

  useEffect(() => {
    return () => {
      revokePlaybackBlobUrl();
    };
  }, [revokePlaybackBlobUrl]);

  useEffect(() => {
    const onPref = () => {
      if (!readHeardAudioCacheEnabled()) {
        heardCacheArmedRef.current = null;
      }
    };
    window.addEventListener(HEARD_AUDIO_CACHE_PREF_EVENT, onPref);
    return () => window.removeEventListener(HEARD_AUDIO_CACHE_PREF_EVENT, onPref);
  }, []);

  // 预取后续多曲流：iOS 后台 ended 时只能同步切 src+play，不能再 await 拉流；
  // 多首缓存后可连续连播，而不是只再切一首就停。
  useEffect(() => {
    const upcoming = resolvedUpcomingItems;
    if (upcoming.length === 0) {
      nextStreamRef.current = null;
      return;
    }

    let cancelled = false;

    const warmItem = async (item: PlaylistAudioItem) => {
      const videoId = item.youtubeVideoId;
      if (!videoId || videoId === current?.youtubeVideoId) return null;
      const existing = preloadCacheRef.current.get(videoId);
      if (existing) return existing;

      try {
        const cached = item.audio;
        const status =
          (cached &&
          (cached.status === 'ready' || cached.previewStreamUrl)
            ? cached
            : null) ?? (await getYoutubeAudioStatus(videoId));
        if (cancelled) return null;
        const picked = await pickStreamFromStatus(videoId, status);
        if (!picked || cancelled) return null;
        const resolved = resolveStreamSrc(picked.url);
        let playback = resolved;
        if (!picked.preview && readHeardAudioCacheEnabled()) {
          const local = await getHeardAudioCachedObjectUrl(videoId);
          if (cancelled) {
            if (local) {
              try {
                URL.revokeObjectURL(local);
              } catch {
                /* ignore */
              }
            }
            return null;
          }
          if (local) playback = local;
        }
        const entry: PrefetchedStream = {
          videoId,
          url: playback,
          preview: picked.preview,
          networkUrl: picked.preview ? null : resolved,
        };
        preloadCacheRef.current.set(videoId, entry);
        return entry;
      } catch {
        return null;
      }
    };

    void (async () => {
      await Promise.all(upcoming.map((item) => warmItem(item)));
      if (cancelled) return;

      const keep = new Set(upcoming.map((item) => item.youtubeVideoId));
      if (current?.youtubeVideoId) keep.add(current.youtubeVideoId);
      for (const key of [...preloadCacheRef.current.keys()]) {
        if (!keep.has(key)) {
          const stale = preloadCacheRef.current.get(key);
          if (stale?.url.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(stale.url);
            } catch {
              /* ignore */
            }
          }
          preloadCacheRef.current.delete(key);
        }
      }

      const nextId = upcoming[0]?.youtubeVideoId;
      const nextEntry = nextId ? preloadCacheRef.current.get(nextId) ?? null : null;
      nextStreamRef.current = nextEntry;

      try {
        if (!preloadAudioRef.current) {
          preloadAudioRef.current = new Audio();
          preloadAudioRef.current.preload = 'auto';
        }
        const pre = preloadAudioRef.current;
        if (nextEntry && pre.src !== nextEntry.url && !pre.src.endsWith(nextEntry.url)) {
          pre.src = nextEntry.url;
        }
      } catch {
        /* 预加载失败不影响正式播放 */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    resolvedUpcomingItems,
    current?.youtubeVideoId,
    pickStreamFromStatus,
  ]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.min(1, Math.max(0, volume / 100));
    el.muted = muted || volume === 0;
  }, [volume, muted]);

  useEffect(() => {
    writeStoredPlayerVolume(volume);
  }, [volume]);

  const setVolumeLevel = useCallback((next: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(next)));
    setVolume(clamped);
    if (clamped > 0) setMuted(false);
    volumeBeforeMuteRef.current = clamped > 0 ? clamped : volumeBeforeMuteRef.current;
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      if (prev || volume === 0) {
        const restored = volumeBeforeMuteRef.current || 100;
        setVolume(restored);
        return false;
      }
      volumeBeforeMuteRef.current = volume > 0 ? volume : volumeBeforeMuteRef.current || 100;
      return true;
    });
  }, [volume]);

  const seekVolumeFromClientX = useCallback(
    (clientX: number) => {
      const bar = volumeProgressRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      setVolumeLevel(ratio * 100);
    },
    [setVolumeLevel],
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      const trackDuration = playbackDuration;
      if (!Number.isFinite(trackDuration) || trackDuration <= 0) return;
      const clamped = Math.min(1, Math.max(0, ratio));
      const targetTime = clamped * trackDuration;
      setCurrentTime(targetTime);
      const el = audioRef.current;
      if (el) {
        try {
          el.currentTime = targetTime;
        } catch {
          /* 预览流或 metadata 未就绪时可能失败，UI 仍按 targetTime 显示 */
        }
      }
    },
    [playbackDuration],
  );

  useEffect(() => {
    if (!progressHandleRef) return;
    progressHandleRef.current = { seekToRatio };
    return () => {
      progressHandleRef.current = null;
    };
  }, [progressHandleRef, seekToRatio]);

  const lastProgressNotifyAtRef = useRef(0);

  useEffect(() => {
    if (!progressNotifyRef.current) return;
    const now = performance.now();
    const isTrackReset = currentTime < 0.05;
    if (!isTrackReset && now - lastProgressNotifyAtRef.current < 250) return;
    lastProgressNotifyAtRef.current = now;
    progressNotifyRef.current({
      currentTime,
      duration: playbackDuration,
      canSeek,
      videoId: currentVideoIdRef.current || undefined,
    });
  }, [currentTime, playbackDuration, canSeek]);

  const beginSeamlessHandoffIfReady = useCallback(() => {
    const nextVideoId = resolvedNextItem?.youtubeVideoId;
    const prefetched =
      (nextVideoId && preloadCacheRef.current.get(nextVideoId)) ||
      (nextVideoId && nextStreamRef.current?.videoId === nextVideoId
        ? nextStreamRef.current
        : null);
    const el = audioRef.current;
    if (!prefetched || !el) return false;

    // iOS Safari/PWA：必须在用户手势 / ended 同步栈内切 src 并 play
    seamlessHandoffRef.current = prefetched;
    skipStreamFetchVideoIdRef.current = prefetched.videoId;
    skipPauseSyncRef.current = true;
    wantPlayRef.current = true;
    revokePlaybackBlobUrl();
    if (prefetched.url.startsWith('blob:')) {
      blobUrlRef.current = prefetched.url;
    }
    networkStreamUrlRef.current = prefetched.preview
      ? null
      : (prefetched.networkUrl ?? (prefetched.url.startsWith('blob:') ? null : prefetched.url));
    heardCacheArmedRef.current = null;
    streamUrlRef.current = prefetched.url;
    setStreamUrl(prefetched.url);
    setUsingPreview(prefetched.preview);
    usingPreviewRef.current = prefetched.preview;
    setLoadingStream(false);
    try {
      el.src = prefetched.url;
      el.load();
      void el.play().catch(() => undefined);
    } catch {
      /* 交给后续 React 路径重试 */
    }
    // 立刻把「再下一首」备进 nextStreamRef / 隐藏 audio，供下一轮 ended 使用
    const afterNextId = upcomingItemsRef.current[1]?.youtubeVideoId;
    const afterNext = afterNextId ? preloadCacheRef.current.get(afterNextId) ?? null : null;
    nextStreamRef.current = afterNext;
    if (afterNext && preloadAudioRef.current) {
      try {
        const pre = preloadAudioRef.current;
        if (pre.src !== afterNext.url && !pre.src.endsWith(afterNext.url)) {
          pre.src = afterNext.url;
        }
      } catch {
        /* ignore */
      }
    }
    return true;
  }, [resolvedNextItem?.youtubeVideoId, revokePlaybackBlobUrl]);

  const advanceToNextTrack = useCallback(() => {
    if (endedHandledRef.current) return;
    endedHandledRef.current = true;

    if (repeatMode === 'one') {
      const el = audioRef.current;
      endedHandledRef.current = false;
      armHeardAudioCache(currentVideoIdRef.current);
      if (el) {
        el.currentTime = 0;
        void el.play().catch(() => undefined);
      }
      onPlayingChange(true);
      return;
    }

    armHeardAudioCache(currentVideoIdRef.current);
    beginSeamlessHandoffIfReady();

    skipPauseSyncRef.current = true;
    if (onNextTrack) {
      onNextTrack();
    } else if (activeIndex < items.length - 1) {
      onActiveIndexChange(activeIndex + 1);
      onPlayingChange(true);
    } else if (repeatMode === 'all' && items.length > 0) {
      onActiveIndexChange(0);
      onPlayingChange(true);
    } else {
      skipPauseSyncRef.current = false;
      seamlessHandoffRef.current = null;
      onPlayingChange(false);
    }
  }, [
    activeIndex,
    armHeardAudioCache,
    beginSeamlessHandoffIfReady,
    items.length,
    onActiveIndexChange,
    onPlayingChange,
    onNextTrack,
    repeatMode,
  ]);

  // 回到前台时补切歌 / 续播（后台若 ended 未触发或 handoff 失败）
  useEffect(() => {
    const resumeIfNeeded = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const el = audioRef.current;
      if (!el || !wantPlayRef.current) return;

      if (el.ended || (el.paused && el.currentTime > 0 && Number.isFinite(el.duration) && el.currentTime >= el.duration - 0.5)) {
        endedHandledRef.current = false;
        advanceToNextTrack();
        return;
      }

      if (el.paused && streamUrlRef.current) {
        skipPauseSyncRef.current = true;
        void el.play().catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', resumeIfNeeded);
    window.addEventListener('pageshow', resumeIfNeeded);
    return () => {
      document.removeEventListener('visibilitychange', resumeIfNeeded);
      window.removeEventListener('pageshow', resumeIfNeeded);
    };
  }, [advanceToNextTrack]);

  const syncDurationFromAudio = useCallback((el: HTMLAudioElement) => {
    const trackDuration = el.duration;
    if (Number.isFinite(trackDuration) && trackDuration > 0 && trackDuration !== Infinity) {
      setDuration(trackDuration);
    }
  }, []);

  const handleAudioReady = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      syncDurationFromAudio(e.currentTarget);
      if (!wantPlayRef.current) return;
      skipPauseSyncRef.current = true;
      void e.currentTarget.play().catch(() => {});
    },
    [syncDurationFromAudio],
  );

  const syncProgressFromAudio = useCallback(() => {
    if (scrubbingRef.current) return;
    const el = audioRef.current;
    if (!el) return;
    if (!audioSrcMatchesStream(el, streamUrlRef.current)) return;
    setCurrentTime(el.currentTime);
    syncDurationFromAudio(el);
  }, [syncDurationFromAudio]);

  useEffect(() => {
    if (!streamUrl) return;

    let rafId = 0;
    const tick = () => {
      syncProgressFromAudio();
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [streamUrl, activeIndex, syncProgressFromAudio]);

  useEffect(() => {
    if (!playing || !streamUrl) return;
    const id = window.setInterval(() => {
      if (!scrubbingRef.current) return;
      scrubbingRef.current = false;
      syncProgressFromAudio();
    }, 2000);
    return () => window.clearInterval(id);
  }, [playing, streamUrl, syncProgressFromAudio]);

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const el = e.currentTarget;
      if (!scrubbingRef.current && audioSrcMatchesStream(el, streamUrlRef.current)) {
        setCurrentTime(el.currentTime);
        syncDurationFromAudio(el);
      }

      if (
        !usingPreviewRef.current &&
        shouldCacheHeardProgress(el.currentTime, el.duration)
      ) {
        armHeardAudioCache(currentVideoIdRef.current);
      }

      if ((usingPreview && !onNextTrack) || endedHandledRef.current) return;

      const trackDuration = el.duration;
      if (!Number.isFinite(trackDuration) || trackDuration <= 0) return;
      if (el.paused || el.seeking) return;
      if (el.currentTime < trackDuration - 0.35) return;

      advanceToNextTrack();
    },
    [advanceToNextTrack, armHeardAudioCache, onNextTrack, syncDurationFromAudio, usingPreview],
  );

  const handleEnded = useCallback(() => {
    if (!streamUrlRef.current) return;
    armHeardAudioCache(currentVideoIdRef.current);
    // 有 onNextTrack（试听电台）时播完切下一首；否则 preview 流重播当前曲
    if (usingPreviewRef.current && !onNextTrack) {
      if (wantPlayRef.current) {
        void replayCurrentTrackStream();
      } else {
        onPlayingChange(false);
      }
      return;
    }
    advanceToNextTrack();
  }, [advanceToNextTrack, armHeardAudioCache, onNextTrack, replayCurrentTrackStream, onPlayingChange]);

  const handlePause = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (skipPauseSyncRef.current) return;
      if (e.currentTarget.ended) {
        if (usingPreviewRef.current && !onNextTrack) {
          if (wantPlayRef.current) void replayCurrentTrackStream();
          return;
        }
        advanceToNextTrack();
        return;
      }
      // 后台连播换 src 时浏览器常会误发 pause；若仍想继续播则忽略并重试
      if (wantPlayRef.current && typeof document !== 'undefined' && document.hidden) {
        skipPauseSyncRef.current = true;
        void e.currentTarget.play().catch(() => {
          skipPauseSyncRef.current = false;
        });
        return;
      }
      onPlayingChange(false);
    },
    [advanceToNextTrack, onNextTrack, replayCurrentTrackStream, onPlayingChange],
  );

  const handleAudioError = useCallback(() => {
    if (!streamUrlRef.current) return;
    setPlayerError(friendlyError('audio_playback_failed', t));
    onPlayingChange(false);
  }, [onPlayingChange, t]);

  const goNext = useCallback(() => {
    beginSeamlessHandoffIfReady();
    skipPauseSyncRef.current = true;
    if (onNextTrack) {
      onNextTrack();
    } else if (activeIndex < items.length - 1) {
      onActiveIndexChange(activeIndex + 1);
      onPlayingChange(true);
    } else if (repeatMode === 'all' && items.length > 0) {
      onActiveIndexChange(0);
      onPlayingChange(true);
    } else {
      skipPauseSyncRef.current = false;
      seamlessHandoffRef.current = null;
      onPlayingChange(false);
    }
  }, [
    activeIndex,
    beginSeamlessHandoffIfReady,
    items.length,
    onActiveIndexChange,
    onPlayingChange,
    onNextTrack,
    repeatMode,
  ]);

  const goPrev = useCallback(() => {
    skipPauseSyncRef.current = true;
    if (onPrevTrack) {
      onPrevTrack();
    } else if (activeIndex > 0) {
      onActiveIndexChange(activeIndex - 1);
      onPlayingChange(true);
    } else {
      skipPauseSyncRef.current = false;
    }
  }, [activeIndex, onActiveIndexChange, onPlayingChange, onPrevTrack]);

  const nextDisabled =
    canGoNext !== undefined ? !canGoNext : activeIndex >= items.length - 1 && !onNextTrack;
  const prevDisabled = canGoPrev !== undefined ? !canGoPrev : activeIndex <= 0;

  useSwipeTrackNavigation({
    targetRef: mobileSwipeRef,
    enabled: isMobileRecord && items.length > 0,
    onNext: goNext,
    onPrev: goPrev,
    canGoNext: !nextDisabled,
    canGoPrev: !prevDisabled,
  });

  const handleMediaPlay = useCallback(() => {
    if (!streamUrl && loadingStream) return;
    if (!streamUrl) {
      wantPlayRef.current = true;
      onPlayingChange(true);
      return;
    }
    wantPlayRef.current = true;
    skipPauseSyncRef.current = true;
    onPlayingChange(true);
    attemptPlay();
  }, [streamUrl, loadingStream, onPlayingChange, attemptPlay]);

  const handleMediaPause = useCallback(() => {
    wantPlayRef.current = false;
    onPlayingChange(false);
  }, [onPlayingChange]);

  useMediaSession(
    Boolean(current && streamUrl),
    playing,
    current
      ? {
          title: current.title,
          artist: t('app.name'),
          album: playlistTitle,
          videoId: current.youtubeVideoId,
        }
      : null,
    currentTime,
    duration,
    {
      onPlay: handleMediaPlay,
      onPause: handleMediaPause,
      onPreviousTrack: goPrev,
      onNextTrack: goNext,
      canGoPrev: !prevDisabled,
      canGoNext: !nextDisabled,
    },
  );

  if (!current) return null;

  const artworkUrl = youtubeThumb(current.youtubeVideoId);
  const playbackOrderLabel =
    playbackOrderMode === 'loop_one'
      ? t('playlists.repeatOne')
      : playbackOrderMode === 'loop_all'
        ? t('playlists.repeatAll')
        : playbackOrderMode === 'shuffle'
          ? t('playlists.shuffle')
          : t('playlists.playOrderSequential');

  const playbackOrderButton =
    onOpenPlaybackOrder != null ? (
      <button
        type="button"
        className={`playlist-np-icon-btn playlist-np-play-order-btn${playbackOrderMode !== 'sequential' || playbackOrderOpen ? ' active' : ''}`}
        onClick={onOpenPlaybackOrder}
        aria-label={t('playlists.playOrderTitle')}
        aria-pressed={playbackOrderOpen}
        title={playbackOrderLabel}
      >
        <PlaybackOrderModeIcon mode={playbackOrderMode} />
      </button>
    ) : null;

  const langSwitch = (
    <div className="audio-lang-switch" role="group" aria-label={t('playlists.subtitleLanguage')}>
      <button
        type="button"
        className={`audio-lang-btn${subtitleLang === 'en' ? ' active' : ''}`}
        onClick={() => changeSubtitleLang('en')}
      >
        {t('playlists.subtitleEnglishShort')}
      </button>
      <button
        type="button"
        className={`audio-lang-btn${subtitleLang === 'zh' ? ' active' : ''}`}
        onClick={() => changeSubtitleLang('zh')}
      >
        {t('playlists.subtitleChineseShort')}
      </button>
    </div>
  );

  const volumeControls = (
      <div className="audio-volume">
        <div
          ref={volumeProgressRef}
          className="audio-volume-slider"
          role="slider"
          tabIndex={0}
          aria-label={t('playlists.volume')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={volumePct}
          onClick={(e) => seekVolumeFromClientX(e.clientX)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const step = e.key === 'ArrowRight' ? 5 : -5;
            setVolumeLevel((muted ? 0 : volume) + step);
          }}
        >
          <div className="audio-volume-track">
            <div className="audio-volume-fill" style={{ width: `${volumePct}%` }} />
          </div>
        </div>
        <button
          type="button"
          className="audio-transport-btn audio-volume-btn"
          onClick={toggleMute}
          aria-label={muted || volume === 0 ? t('playlists.unmute') : t('playlists.mute')}
        >
          <VolumeIcon level={volume} muted={muted || volume === 0} />
        </button>
      </div>
  );

  const audioOptions = (
    <div className={`audio-options${isNowPlaying ? ' playlist-np-audio-options' : ''}`}>
      {langSwitch}
      {volumeControls}
    </div>
  );

  const transportControls = (
    <div className="audio-transport" role="group" aria-label={t('playlists.playerSectionAudio')}>
      <button
        type="button"
        className="audio-transport-btn"
        onClick={goPrev}
        disabled={prevDisabled}
        aria-label={t('playlists.prevTrack')}
      >
        <svg className="audio-transport-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M14 6l-6 6 6 6V6z" />
        </svg>
      </button>
      <button
        type="button"
        className="audio-transport-btn audio-transport-btn--primary"
        onClick={() => {
          if (!streamUrl && loadingStream) return;
          if (!streamUrl) {
            wantPlayRef.current = true;
            onPlayingChange(true);
            return;
          }
          onPlayingChange(!playing);
        }}
        disabled={loadingStream && !streamUrl}
        aria-label={playing ? t('playlists.pause') : t('playlists.play')}
      >
        {playing ? (
          <svg className="audio-transport-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 6h3v12H7V6zm7 0h3v12h-3V6z" />
          </svg>
        ) : (
          <svg
            className="audio-transport-icon audio-transport-icon--play"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="audio-transport-btn"
        onClick={goNext}
        disabled={nextDisabled}
        aria-label={t('playlists.nextTrack')}
      >
        <svg className="audio-transport-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M10 6l6 6-6 6V6z" />
        </svg>
      </button>
    </div>
  );

  const totalDurationLabel =
    playbackDuration > 0 ? formatPlaybackTime(playbackDuration) : '--:--';
  const currentTimeLabel = formatPlaybackTime(currentTime);

  if (isYoutubeWatch) {
    const prevDisabled = canGoPrev !== undefined ? !canGoPrev : activeIndex <= 0;
    const nextDisabled =
      canGoNext !== undefined ? !canGoNext : activeIndex >= items.length - 1;

    return (
      <section
        className={`youtube-player-section youtube-player-section--native youtube-player-section--audio-watch${mobileInline ? ' youtube-player-section--mobile-inline' : ''}`}
        aria-label={t('playlists.playerSectionAudio')}
      >
        <div className="youtube-player-frame-wrap">
          <div className="youtube-player-video-shell youtube-player-audio-cover">
            <img className="youtube-player-audio-artwork" src={artworkUrl} alt="" loading="lazy" />
            {activeCaption && (
              <div className="youtube-player-subtitles" aria-live="polite">
                <p className="youtube-player-subtitle-text">{activeCaption}</p>
              </div>
            )}
            <div className="yt-native-audio-controls">
              <div className="yt-native-audio-transport">
                <button type="button" className="yt-native-btn" onClick={goPrev} disabled={prevDisabled} aria-label={t('playlists.prevTrack')}>‹</button>
                <button
                  type="button"
                  className="yt-native-btn yt-native-btn--primary"
                  disabled={loadingStream && !streamUrl}
                  onClick={() => {
                    if (!streamUrl && loadingStream) return;
                    if (!streamUrl) {
                      wantPlayRef.current = true;
                      onPlayingChange(true);
                      return;
                    }
                    onPlayingChange(!playing);
                  }}
                  aria-label={playing ? t('playlists.pause') : t('playlists.play')}
                >
                  {playing ? '▮▮' : '▶'}
                </button>
                <button type="button" className="yt-native-btn" onClick={goNext} disabled={nextDisabled} aria-label={t('playlists.nextTrack')}>›</button>
              </div>
              <input
                className="yt-native-seek"
                type="range"
                min={0}
                max={playbackDuration > 0 ? playbackDuration : 0}
                step={0.1}
                value={Math.min(currentTime, playbackDuration > 0 ? playbackDuration : 0)}
                disabled={!canSeek}
                aria-label={t('playlists.seek')}
                onChange={(e) => {
                  if (!canSeek || playbackDuration <= 0) return;
                  seekToRatio(Number(e.target.value) / playbackDuration);
                }}
              />
              <div className="yt-native-time">
                <span>{currentTimeLabel}</span>
                <span>{totalDurationLabel}</span>
              </div>
              <div className="yt-native-audio-options">{langSwitch}</div>
            </div>
          </div>
        </div>

        <audio
          ref={audioRef}
          className="playlist-audio-element"
          src={streamUrl ?? undefined}
          preload="auto"
          playsInline
          loop={false}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleAudioReady}
          onDurationChange={handleAudioReady}
          onLoadedData={handleAudioReady}
          onCanPlay={handleAudioReady}
          onCanPlayThrough={handleAudioReady}
          onEnded={handleEnded}
          onPlay={() => {
            skipPauseSyncRef.current = false;
            onPlayingChange(true);
          }}
          onPause={handlePause}
          onError={handleAudioError}
        />

        {(isProcessing || playerError || audioStatus?.status === 'failed') && (
          <p className={`playlist-audio-status${playerError || audioStatus?.status === 'failed' ? ' error-msg' : ' playlists-muted'}`}>
            {playerError ??
              (audioStatus?.status === 'failed'
                ? friendlyError(audioStatus.errorCode ?? 'audio_extract_failed', t)
                : usingPreview
                  ? t('playlists.audioCachingWhilePlaying', { title: current.title })
                  : t('playlists.audioCaching', { title: current.title }))}
          </p>
        )}
      </section>
    );
  }

  const seekBar = (
    <AudioSeekBar
      key={current?.youtubeVideoId ?? 'none'}
      resetKey={current?.youtubeVideoId ?? 'none'}
      currentTime={currentTime}
      duration={playbackDuration}
      canSeek={canSeek}
      usingPreview={usingPreview}
      onSeekRatio={seekToRatio}
      onScrubStart={() => {
        scrubbingRef.current = true;
      }}
      onScrubEnd={() => {
        scrubbingRef.current = false;
        syncProgressFromAudio();
      }}
      className="audio-player-bar-progress"
    />
  );

  const progressBlock = (
    <div className="playlist-np-progress">
      {seekBar}
      <div className={`audio-time${isNowPlaying ? ' playlist-np-times' : ''}`}>
        {isNowPlaying ? (
          <>
            <span className="playlist-np-time-current">{currentTimeLabel}</span>
            <span className="playlist-np-time-total">{totalDurationLabel}</span>
          </>
        ) : (
          formatPlaybackTimeRange(currentTime, playbackDuration || duration)
        )}
      </div>
    </div>
  );

  const desktopProgressBlock = (
    <div className="playlist-np-progress playlist-np-progress--desktop-inline">
      <span className="playlist-np-time-current">{currentTimeLabel}</span>
      {seekBar}
      <span className="playlist-np-time-total">{totalDurationLabel}</span>
    </div>
  );

  const shuffleRepeatControls = isNowPlaying || isDesktopDock || isMobileRecord ? playbackOrderButton : null;

  const audioElement = (
    <audio
      ref={audioRef}
      className="playlist-audio-element"
      src={streamUrl ?? undefined}
      preload="auto"
      playsInline
      loop={false}
      onTimeUpdate={handleTimeUpdate}
      onLoadedMetadata={handleAudioReady}
      onDurationChange={handleAudioReady}
      onLoadedData={handleAudioReady}
      onCanPlay={handleAudioReady}
      onCanPlayThrough={handleAudioReady}
      onEnded={handleEnded}
      onPlay={() => {
        skipPauseSyncRef.current = false;
        onPlayingChange(true);
      }}
      onPause={handlePause}
      onError={handleAudioError}
    />
  );

  const statusMessages = (isProcessing || playerError || audioStatus?.status === 'failed') && (
    <p
      className={`playlist-audio-status${playerError || audioStatus?.status === 'failed' ? ' error-msg' : ' playlists-muted'}`}
    >
      {playerError ??
        (audioStatus?.status === 'failed'
          ? friendlyError(audioStatus.errorCode ?? 'audio_extract_failed', t)
          : usingPreview
            ? t('playlists.audioCachingWhilePlaying', { title: current.title })
            : t('playlists.audioCaching', { title: current.title }))}
    </p>
  );

  if (isDesktopDock) {
    return (
      <section className="playlist-audio-dock" aria-label={t('playlists.playerSectionAudio')}>
        <div className="playlist-audio-dock-inner">
          <div className="playlist-audio-dock-track">
            <img className="playlist-audio-dock-thumb" src={artworkUrl} alt="" loading="lazy" />
            <div className="playlist-audio-dock-meta">
              <ScrollingTitle text={current.title} className="playlist-audio-dock-title" />
              {playlistTitle && <p className="playlist-audio-dock-album">{playlistTitle}</p>}
            </div>
          </div>
          <div className="playlist-audio-dock-center">
            <div className="playlist-audio-dock-transport">{transportControls}</div>
            <div className="playlist-audio-dock-progress">{desktopProgressBlock}</div>
          </div>
          <div className="playlist-audio-dock-options">
            {shuffleRepeatControls}
            {volumeControls}
            <button
              type="button"
              className={`playlist-np-icon-btn playlist-audio-dock-queue-btn${queueOpen ? ' active' : ''}`}
              aria-label={t('playlists.queueTitle')}
              aria-pressed={queueOpen}
              onClick={onToggleQueue}
              title={t('playlists.queueTitle')}
            >
              <QueueIcon />
            </button>
          </div>
        </div>
        {statusMessages}
        {audioElement}
      </section>
    );
  }

  if (isMobileRecord) {
    const recordLangSwitch = (
      <div className="playlist-audio-record-lang" role="group" aria-label={t('playlists.subtitleLanguage')}>
        <button
          type="button"
          className={`audio-lang-btn${subtitleLang === 'zh' ? ' active' : ''}`}
          onClick={() => changeSubtitleLang('zh')}
        >
          {t('playlists.subtitleChineseShort')}
        </button>
        <button
          type="button"
          className={`audio-lang-btn${subtitleLang === 'en' ? ' active' : ''}`}
          onClick={() => changeSubtitleLang('en')}
        >
          {t('playlists.subtitleEnglishShort')}
        </button>
      </div>
    );

    const addToListButton = onAddToList ? (
      <button
        type="button"
        className={`playlist-audio-record-add-btn${showLyrics ? ' playlist-audio-record-add-btn--lyrics-head' : ' playlist-audio-record-add-btn--cover-head'}`}
        onClick={(e) => {
          e.stopPropagation();
          onAddToList();
        }}
        aria-label={t('playlists.addToList')}
      >
        <PlusIcon />
      </button>
    ) : null;

    return (
      <section
        ref={mobileSwipeRef}
        className={`playlist-audio-player playlist-audio-player--mobile-record playlist-audio-player--swipe-nav${showLyrics ? ' playlist-audio-player--lyrics-open' : ''}`}
        aria-label={t('playlists.playerSectionAudio')}
      >
        {!showLyrics ? addToListButton : null}
        <div
          className={`playlist-audio-record-stage${showLyrics ? ' playlist-audio-record-stage--lyrics' : ''}`}
        >
          {showLyrics ? (
            <div className="playlist-audio-record-lyrics-view">
              <header className="playlist-audio-record-lyrics-head">
                <button
                  type="button"
                  className="playlist-audio-record-back-btn"
                  onClick={() => setShowLyrics(false)}
                >
                  {t('playlists.backToCover')}
                </button>
                {recordLangSwitch}
                {addToListButton ?? <span className="playlist-audio-record-lyrics-head-spacer" aria-hidden />}
              </header>
              <PlaylistLyricsScroller
                cues={captionCues}
                currentTime={currentTime}
                loading={lyricsLoading}
                loadingMessage={lyricsLoadingMessage}
                emptyMessage={lyricsEmptyMessage}
                className="playlist-audio-record-lyrics-scroller"
                panelRef={lyricsPanelRef}
                onTap={() => setShowLyrics(false)}
              />
            </div>
          ) : (
            <div className="playlist-audio-record-disc-wrap">
              <button
                type="button"
                className={`playlist-audio-record-disc${playing ? ' is-playing' : ''}`}
                onClick={() => setShowLyrics(true)}
                aria-label={t('playlists.showLyrics')}
              >
                <div className="playlist-audio-record-disc-ring" aria-hidden />
                <img className="playlist-audio-record-art" src={artworkUrl} alt="" loading="lazy" />
              </button>
            </div>
          )}
        </div>

        {!showLyrics && (
          <PlaylistKaraokeLyrics
            cues={captionCues}
            currentTime={currentTime}
            loading={lyricsLoading}
            loadingMessage={lyricsLoadingMessage}
            emptyMessage={lyricsError ? t('errors.captions_fetch_failed') : t('playlists.tapCdForLyrics')}
            onOpen={() => setShowLyrics(true)}
            openLabel={t('playlists.showLyrics')}
          />
        )}

        {statusMessages}
        {audioElement}
      </section>
    );
  }

  return (
    <section
      className={`playlist-audio-player${isNowPlaying ? ' playlist-audio-player--now-playing' : ''}`}
      aria-label={t('playlists.playerSectionAudio')}
    >
      <div className="playlist-np-stage">
        <div
          className={`playlist-audio-artwork-wrap${isNowPlaying ? ' playlist-np-artwork' : ' desktop-audio-artwork'}`}
        >
          <img className="playlist-audio-artwork" src={artworkUrl} alt="" loading="lazy" />
          {activeCaption && !isNowPlaying && (
            <div className="playlist-audio-subtitles-overlay" aria-live="polite">
              <p>{activeCaption}</p>
            </div>
          )}
        </div>

        {isNowPlaying && activeCaption && (
          <p className="playlist-np-caption mobile-only" aria-live="polite">
            {activeCaption}
          </p>
        )}

        {!isNowPlaying && (
          <div className="playlist-audio-lyrics-panel mobile-only" aria-live="polite">
            {lyricsLoading ? (
              <p className="playlist-audio-lyrics-empty">{t('playlists.loadingLyrics')}</p>
            ) : activeCaption ? (
              <p className="playlist-audio-lyrics-text">{activeCaption}</p>
            ) : (
              <p className="playlist-audio-lyrics-empty">
                {captionCues.length > 0 ? '\u00a0' : lyricsEmptyMessage}
              </p>
            )}
          </div>
        )}

      <audio
        ref={audioRef}
        className="playlist-audio-element"
        src={streamUrl ?? undefined}
        preload="auto"
        playsInline
        loop={false}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleAudioReady}
        onDurationChange={handleAudioReady}
        onLoadedData={handleAudioReady}
        onCanPlay={handleAudioReady}
        onCanPlayThrough={handleAudioReady}
        onEnded={handleEnded}
        onPlay={() => {
          skipPauseSyncRef.current = false;
          onPlayingChange(true);
        }}
        onPause={handlePause}
        onError={handleAudioError}
      />

      <div className={`playlist-audio-controls${isNowPlaying ? ' playlist-np-info-col' : ''}`}>
        {isProcessing && (
          <p className="playlists-muted playlist-audio-status">
            {usingPreview
              ? t('playlists.audioCachingWhilePlaying', { title: current.title })
              : t('playlists.audioCaching', { title: current.title })}
          </p>
        )}

        {audioStatus?.status === 'failed' && (
          <p className="error-msg playlist-audio-status">
            {friendlyError(audioStatus.errorCode ?? 'audio_extract_failed', t)}
          </p>
        )}

        {playerError && <p className="error-msg playlist-audio-status">{playerError}</p>}

        <header className={`playlist-audio-meta${isNowPlaying ? ' desktop-only' : ''}`}>
          <div className="playlist-np-meta-head">
            <ScrollingTitle text={current.title} className="playlist-audio-title" />
            {isNowPlaying && (
              <div className="playlist-np-meta-lang desktop-only">{langSwitch}</div>
            )}
          </div>
          <div className="playlist-np-meta-sub">
            {playlistTitle && isNowPlaying && (
              <span className="playlist-np-album-label">{playlistTitle}</span>
            )}
            <span className="playlist-audio-index">
              {t('playlists.trackCounter', { current: activeIndex + 1, total: items.length })}
            </span>
          </div>
        </header>

        {isNowPlaying && (
          <PlaylistLyricsScroller
            cues={captionCues}
            currentTime={currentTime}
            loading={lyricsLoading}
            loadingMessage={lyricsLoadingMessage}
            emptyMessage={lyricsEmptyMessage}
            className="playlist-np-lyrics-desktop desktop-only"
            panelRef={lyricsPanelRef}
          />
        )}

        {!isNowPlaying && (
          <>
            <div className="audio-player-bar">
              {transportControls}
              {progressBlock}
            </div>
            {audioOptions}
          </>
        )}
      </div>

      {isNowPlaying && (
        <div className="playlist-np-dock">
          <div className="playlist-np-desktop-footer desktop-only">
            {desktopProgressBlock}
            <div className="playlist-np-footer-row">
              {shuffleRepeatControls}
              <div className="playlist-np-transport-block">{transportControls}</div>
              <div className="playlist-np-volume-desktop">{volumeControls}</div>
            </div>
          </div>

          <div className="playlist-np-mobile-dock mobile-only">
            <div className="playlist-np-track">
              <ScrollingTitle text={current.title} className="playlist-np-track-title" />
              {playlistTitle && <p className="playlist-np-track-album">{playlistTitle}</p>}
            </div>

            <div className="playlist-np-progress playlist-np-progress--seek-only">{seekBar}</div>

            <div className="playlist-np-time-row">
              <span className="playlist-np-time-current">{formatPlaybackTime(currentTime)}</span>
              <span className="playlist-np-time-total">{totalDurationLabel}</span>
            </div>

            <div className="playlist-np-controls-row">
              {playbackOrderButton}

              <div className="playlist-np-transport-wrap">{transportControls}</div>

              <button
                type="button"
                className={`playlist-np-dock-corner-btn${queueOpen ? ' active' : ''}`}
                onClick={onToggleQueue}
                aria-label={t('playlists.queueTitle')}
                aria-pressed={queueOpen}
              >
                <QueueIcon />
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
