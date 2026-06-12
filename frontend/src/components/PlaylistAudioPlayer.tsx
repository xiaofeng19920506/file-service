import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { getYoutubeAudioStatus, getYoutubeAudioStreamUrl } from '../api/youtube-audio';
import type { YoutubeAudioStatus } from '../api/youtube-audio';
import {
  fetchVideoCaptions,
  findActiveCaption,
  type CaptionCue,
} from '../api/youtube-captions';
import { useI18n } from '../i18n';
import {
  readSubtitleLanguageForVideo,
  writeSubtitleLanguageForVideo,
  type SubtitleLanguage,
} from '../lib/subtitle-preference';
import { friendlyError } from '../lib/error-messages';
import {
  readStoredPlayerVolume,
  writeStoredPlayerVolume,
} from '../lib/player-volume';
import { useMediaSession } from '../hooks/useMediaSession';
import { useSwipeTrackNavigation } from '../hooks/useSwipeTrackNavigation';
import type { PlaylistRepeatMode } from '../lib/playlist-repeat-mode';
import { PlaybackMoreIcon, QueueIcon, RepeatIcon, ShuffleIcon } from './icons';
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
  repeatMode?: PlaylistRepeatMode;
  onCycleRepeat?: () => void;
  onRepeatModeChange?: (mode: PlaylistRepeatMode) => void;
  shuffleEnabled?: boolean;
  onToggleShuffle?: () => void;
  onToggleQueue?: () => void;
  queueOpen?: boolean;
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
  onCycleRepeat,
  onRepeatModeChange,
  shuffleEnabled = false,
  onToggleShuffle,
  onToggleQueue,
  queueOpen = false,
}: PlaylistAudioPlayerProps) {
  const { t } = useI18n();
  const isNowPlaying = variant === 'nowPlaying';
  const isYoutubeWatch = variant === 'youtubeWatch';
  const isDesktopDock = variant === 'desktopDock';
  const isMobileRecord = variant === 'mobileRecord';
  const audioRef = useRef<HTMLAudioElement>(null);
  const mobileSwipeRef = useRef<HTMLElement>(null);
  const volumeProgressRef = useRef<HTMLDivElement>(null);
  const mobileOptionsRef = useRef<HTMLDivElement>(null);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const wantPlayRef = useRef(playing);
  const skipPauseSyncRef = useRef(false);
  const endedHandledRef = useRef(false);
  const playbackTrackKeyRef = useRef('');
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [usingPreview, setUsingPreview] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [durationHint, setDurationHint] = useState(0);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [subtitleLang, setSubtitleLang] = useState<SubtitleLanguage>('en');
  const [volume, setVolume] = useState(readStoredPlayerVolume);
  const [muted, setMuted] = useState(false);
  const volumeBeforeMuteRef = useRef(volume);
  const lyricsPanelRef = useRef<HTMLDivElement>(null);

  const current = items[activeIndex];
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
  const scrubbingRef = useRef(false);
  const volumePct = muted ? 0 : volume;
  const activeCaption = useMemo(
    () => findActiveCaption(captionCues, currentTime),
    [captionCues, currentTime],
  );

  useEffect(() => {
    wantPlayRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const panel = lyricsPanelRef.current;
    if (!panel) return;
    const activeLine = panel.querySelector<HTMLElement>('[data-active="true"]');
    activeLine?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentTime, captionCues]);

  useEffect(() => {
    if (!mobileOptionsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!mobileOptionsRef.current?.contains(event.target as Node)) {
        setMobileOptionsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [mobileOptionsOpen]);

  useEffect(() => {
    if (queueOpen) setMobileOptionsOpen(false);
  }, [queueOpen]);

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
      const streamed = await getYoutubeAudioStreamUrl(videoId);
      return { url: streamed.url, preview: false };
    }
    if (status.previewStreamUrl) {
      return { url: status.previewStreamUrl, preview: true };
    }
    return null;
  }, []);

  const applyStreamUrl = useCallback((url: string, preview: boolean) => {
    setStreamUrl(resolveStreamSrc(url));
    setUsingPreview(preview);
    setLoadingStream(false);
    setPlayerError(null);
  }, []);

  useEffect(() => {
    if (!current?.youtubeVideoId) return;
    setSubtitleLang(readSubtitleLanguageForVideo(current.youtubeVideoId));
  }, [current?.youtubeVideoId]);

  useEffect(() => {
    if (!current?.youtubeVideoId) {
      setCaptionCues([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchVideoCaptions(current.youtubeVideoId, subtitleLang);
        if (!cancelled) setCaptionCues(data.cues);
      } catch {
        if (!cancelled) setCaptionCues([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current?.youtubeVideoId, subtitleLang]);

  useEffect(() => {
    const videoId = current?.youtubeVideoId;
    if (!videoId || isReady) return;
    const timer = window.setInterval(() => {
      void refreshAudioStatus(videoId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [current?.youtubeVideoId, isReady, refreshAudioStatus]);

  useEffect(() => {
    const videoId = current?.youtubeVideoId;
    if (!videoId) {
      setStreamUrl(null);
      setUsingPreview(false);
      return;
    }

    let cancelled = false;
    setLoadingStream(true);
    setPlayerError(null);
    setStreamUrl(null);
    setUsingPreview(false);
    setCurrentTime(0);
    setDuration(0);
    const hintedDuration =
      typeof audioStatus?.durationSeconds === 'number' &&
      Number.isFinite(audioStatus.durationSeconds) &&
      audioStatus.durationSeconds > 0
        ? audioStatus.durationSeconds
        : 0;
    setDurationHint(hintedDuration);

    void (async () => {
      try {
        const status = (await refreshAudioStatus(videoId)) ?? audioStatus;
        if (!status || cancelled) {
          if (!cancelled) setLoadingStream(false);
          return;
        }

        const picked = await pickStreamFromStatus(videoId, status);
        if (!picked || cancelled) {
          if (!cancelled) setLoadingStream(false);
          return;
        }

        if (!cancelled) applyStreamUrl(picked.url, picked.preview);
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
        if (!cancelled) applyStreamUrl(picked.url, picked.preview);
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

  // 后台缓存完成后从 preview 切到完整 MP3，避免直播流结束误触「单曲循环」
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
        const trackDuration = el?.duration;
        const trackFinished =
          el?.ended === true ||
          (typeof trackDuration === 'number' &&
            Number.isFinite(trackDuration) &&
            trackDuration > 0 &&
            savedTime >= trackDuration - 0.5);

        if (trackFinished) {
          if (wasPlaying) {
            if (onNextTrack) onNextTrack();
            else if (activeIndex < items.length - 1) {
              onActiveIndexChange(activeIndex + 1);
              onPlayingChange(true);
            } else {
              onPlayingChange(false);
            }
          }
          return;
        }

        if (!cancelled) applyStreamUrl(picked.url, false);

        if (el && savedTime > 0.5) {
          const restore = () => {
            el.currentTime = savedTime;
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
    onNextTrack,
    onActiveIndexChange,
    onPlayingChange,
    activeIndex,
    items.length,
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
    playbackTrackKeyRef.current = trackKey;

    skipPauseSyncRef.current = true;
    if (isNewTrack) {
      el.load();
    }
    attemptPlay();
  }, [streamUrl, playing, attemptPlay, activeIndex, current?.youtubeVideoId]);

  useEffect(() => {
    endedHandledRef.current = false;
    playbackTrackKeyRef.current = '';
  }, [activeIndex, current?.youtubeVideoId]);

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

  const progressNotifyRef = useRef(onProgressUpdate);
  const lastProgressNotifyAtRef = useRef(0);
  progressNotifyRef.current = onProgressUpdate;

  useEffect(() => {
    if (!progressNotifyRef.current) return;
    const now = performance.now();
    if (now - lastProgressNotifyAtRef.current < 250) return;
    lastProgressNotifyAtRef.current = now;
    progressNotifyRef.current({
      currentTime,
      duration: playbackDuration,
      canSeek,
    });
  }, [currentTime, playbackDuration, canSeek]);

  const advanceToNextTrack = useCallback(() => {
    if (endedHandledRef.current) return;
    endedHandledRef.current = true;

    if (repeatMode === 'one') {
      const el = audioRef.current;
      endedHandledRef.current = false;
      if (el) {
        el.currentTime = 0;
        void el.play().catch(() => undefined);
      }
      onPlayingChange(true);
      return;
    }

    skipPauseSyncRef.current = true;
    if (onNextTrack) {
      onNextTrack();
    } else if (activeIndex < items.length - 1) {
      onActiveIndexChange(activeIndex + 1);
      onPlayingChange(true);
    } else {
      skipPauseSyncRef.current = false;
      onPlayingChange(false);
    }
  }, [activeIndex, items.length, onActiveIndexChange, onPlayingChange, onNextTrack, repeatMode]);

  const syncDurationFromAudio = useCallback((el: HTMLAudioElement) => {
    const trackDuration = el.duration;
    if (Number.isFinite(trackDuration) && trackDuration > 0 && trackDuration !== Infinity) {
      setDuration(trackDuration);
    }
  }, []);

  const handleAudioReady = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      syncDurationFromAudio(e.currentTarget);
    },
    [syncDurationFromAudio],
  );

  const syncProgressFromAudio = useCallback(() => {
    if (scrubbingRef.current) return;
    const el = audioRef.current;
    if (!el) return;
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
      const el = audioRef.current;
      if (!el || el.paused) return;
      if (Math.abs(el.currentTime - currentTime) > 1.25) {
        scrubbingRef.current = false;
        syncProgressFromAudio();
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [playing, streamUrl, currentTime, syncProgressFromAudio]);

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const el = e.currentTarget;
      if (!scrubbingRef.current) {
        setCurrentTime(el.currentTime);
        syncDurationFromAudio(el);
      }

      if (usingPreview || endedHandledRef.current) return;

      const trackDuration = el.duration;
      if (!Number.isFinite(trackDuration) || trackDuration <= 0) return;
      if (el.paused || el.seeking) return;
      if (el.currentTime < trackDuration - 0.35) return;

      advanceToNextTrack();
    },
    [advanceToNextTrack, syncDurationFromAudio, usingPreview],
  );

  const handleEnded = useCallback(() => {
    advanceToNextTrack();
  }, [advanceToNextTrack]);

  const handlePause = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (skipPauseSyncRef.current) return;
      if (e.currentTarget.ended) {
        advanceToNextTrack();
        return;
      }
      onPlayingChange(false);
    },
    [advanceToNextTrack, onPlayingChange],
  );

  const goNext = useCallback(() => {
    skipPauseSyncRef.current = true;
    if (onNextTrack) {
      onNextTrack();
    } else if (activeIndex < items.length - 1) {
      onActiveIndexChange(activeIndex + 1);
      onPlayingChange(true);
    } else {
      skipPauseSyncRef.current = false;
      onPlayingChange(false);
    }
  }, [activeIndex, items.length, onActiveIndexChange, onPlayingChange, onNextTrack]);

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
  const repeatLabel =
    repeatMode === 'one'
      ? t('playlists.repeatOne')
      : repeatMode === 'all'
        ? t('playlists.repeatAll')
        : t('playlists.repeatOff');

  const langSwitch = (
    <div className="audio-lang-switch" role="group" aria-label={t('playlists.subtitleLanguage')}>
      <button
        type="button"
        className={`audio-lang-btn${subtitleLang === 'en' ? ' active' : ''}`}
        onClick={() => {
          setSubtitleLang('en');
          writeSubtitleLanguageForVideo(current.youtubeVideoId, 'en');
        }}
      >
        {t('playlists.subtitleEnglishShort')}
      </button>
      <button
        type="button"
        className={`audio-lang-btn${subtitleLang === 'zh' ? ' active' : ''}`}
        onClick={() => {
          setSubtitleLang('zh');
          writeSubtitleLanguageForVideo(current.youtubeVideoId, 'zh');
        }}
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

  const mobilePlaybackOptionsActive = shuffleEnabled || repeatMode !== 'off';

  const shuffleRepeatControls = isNowPlaying || isDesktopDock || isMobileRecord ? (
    <div
      className="playlist-np-secondary"
      role="group"
      aria-label={t('playlists.playbackOptions')}
    >
      <button
        type="button"
        className={`playlist-np-icon-btn${shuffleEnabled ? ' active' : ''}`}
        onClick={onToggleShuffle}
        aria-pressed={shuffleEnabled}
        aria-label={t('playlists.shuffle')}
        title={t('playlists.shuffle')}
      >
        <ShuffleIcon />
      </button>
      <button
        type="button"
        className={`playlist-np-icon-btn${repeatMode !== 'off' ? ' active' : ''}`}
        onClick={onCycleRepeat}
        aria-label={repeatLabel}
        title={repeatLabel}
      >
        <RepeatIcon mode={repeatMode} />
      </button>
    </div>
  ) : null;

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
          <div className="playlist-audio-dock-transport">{transportControls}</div>
          <div className="playlist-audio-dock-progress">{desktopProgressBlock}</div>
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
    return (
      <section
        ref={mobileSwipeRef}
        className="playlist-audio-player playlist-audio-player--mobile-record playlist-audio-player--swipe-nav"
        aria-label={t('playlists.playerSectionAudio')}
      >
        <div className="playlist-audio-record-stage">
          <div className={`playlist-audio-record-disc${playing ? ' is-playing' : ''}`}>
            <div className="playlist-audio-record-disc-ring" aria-hidden />
            <img className="playlist-audio-record-art" src={artworkUrl} alt="" loading="lazy" />
          </div>
        </div>

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
            {activeCaption ? (
              <p className="playlist-audio-lyrics-text">{activeCaption}</p>
            ) : (
              <p className="playlist-audio-lyrics-empty">{t('playlists.noLyricsYet')}</p>
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
          <div
            ref={lyricsPanelRef}
            className="playlist-np-lyrics-desktop desktop-only"
            aria-live="polite"
          >
            {captionCues.length > 0 ? (
              <ul className="playlist-np-lyrics-lines">
                {captionCues.map((cue, index) => {
                  const active =
                    currentTime >= cue.start - 0.05 && currentTime < cue.end + 0.05;
                  return (
                    <li
                      key={`${cue.start}-${index}`}
                      className={active ? 'active' : undefined}
                      data-active={active || undefined}
                    >
                      {cue.text}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="playlist-np-lyrics-empty">{t('playlists.noLyricsYet')}</p>
            )}
          </div>
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
              <button
                type="button"
                className={`playlist-np-dock-corner-btn${queueOpen ? ' active' : ''}`}
                onClick={onToggleQueue}
                aria-label={t('playlists.queueTitle')}
                aria-pressed={queueOpen}
              >
                <QueueIcon />
              </button>

              <div className="playlist-np-transport-wrap">{transportControls}</div>

              <div className="playlist-np-options-wrap" ref={mobileOptionsRef}>
                <button
                  type="button"
                  className={`playlist-np-dock-corner-btn${mobilePlaybackOptionsActive ? ' active' : ''}`}
                  onClick={() => setMobileOptionsOpen((open) => !open)}
                  aria-label={t('playlists.playbackOptions')}
                  aria-expanded={mobileOptionsOpen}
                  aria-haspopup="menu"
                >
                  <PlaybackMoreIcon />
                </button>
                {mobileOptionsOpen && (
                  <div className="playlist-np-options-menu" role="menu">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={repeatMode === 'all'}
                      className={`playlist-np-options-item${repeatMode === 'all' ? ' active' : ''}`}
                      onClick={() => {
                        onRepeatModeChange?.(repeatMode === 'all' ? 'off' : 'all');
                        setMobileOptionsOpen(false);
                      }}
                    >
                      <RepeatIcon mode="all" />
                      <span>{t('playlists.repeatAll')}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={repeatMode === 'one'}
                      className={`playlist-np-options-item${repeatMode === 'one' ? ' active' : ''}`}
                      onClick={() => {
                        onRepeatModeChange?.(repeatMode === 'one' ? 'off' : 'one');
                        setMobileOptionsOpen(false);
                      }}
                    >
                      <RepeatIcon mode="one" />
                      <span>{t('playlists.repeatOne')}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={shuffleEnabled}
                      className={`playlist-np-options-item${shuffleEnabled ? ' active' : ''}`}
                      onClick={() => {
                        onToggleShuffle?.();
                        setMobileOptionsOpen(false);
                      }}
                    >
                      <ShuffleIcon />
                      <span>{t('playlists.shuffle')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
