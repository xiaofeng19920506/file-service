import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSeekBarDrag } from '../hooks/useSeekBarDrag';
import { lockLandscapeOrientation } from '../lib/mobile-landscape-lock';
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
export type YoutubePlayerItem = {
  youtubeVideoId: string;
  title: string;
};

type YoutubePlaylistPlayerProps = {
  items: YoutubePlayerItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onNextTrack?: () => void;
  onPrevTrack?: () => void;
  canGoNext?: boolean;
  canGoPrev?: boolean;
  /** 全屏沉浸：控制条在视频底部叠层内 */
  immersive?: boolean;
  /** 沉浸模式下尝试锁定横屏（手机） */
  lockLandscape?: boolean;
  /** @deprecated 使用 immersive */
  mobileImmersive?: boolean;
  /** 沉浸模式 UI（菜单按钮等），渲染在视频层内以便全屏可见 */
  mobileChrome?: ReactNode;
};

type YtPlayer = {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YtPlayer }) => void;
            onStateChange?: (event: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

const CONTROLS_IDLE_MS = 3000;
const VOLUME_STORAGE_KEY = 'youtube-player-volume';

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return 100;
    const value = Number(raw);
    if (!Number.isFinite(value)) return 100;
    return Math.min(100, Math.max(0, Math.round(value)));
  } catch {
    return 100;
  }
}

function loadYoutubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.head.appendChild(script);
      }
    });
  }
  return youtubeApiPromise;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function YoutubePlaylistPlayer({
  items,
  activeIndex,
  onActiveIndexChange,
  playing,
  onPlayingChange,
  onNextTrack,
  onPrevTrack,
  canGoNext,
  canGoPrev,
  immersive: immersiveProp,
  lockLandscape = false,
  mobileImmersive = false,
  mobileChrome,
}: YoutubePlaylistPlayerProps) {
  const immersive = immersiveProp ?? mobileImmersive;
  const { t } = useI18n();
  const elementId = useId().replace(/:/g, '');
  const playerRef = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const activeIndexRef = useRef(activeIndex);
  const itemsRef = useRef(items);
  const playingRef = useRef(playing);
  const onNextTrackRef = useRef(onNextTrack);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeProgressRef = useRef<HTMLDivElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const lastLoadedIndexRef = useRef(-1);
  const ignorePauseUntilRef = useRef(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [subtitleLang, setSubtitleLang] = useState<SubtitleLanguage>('en');
  const [volume, setVolume] = useState(readStoredVolume);
  const [muted, setMuted] = useState(false);
  const volumeBeforeMuteRef = useRef(volume);
  const idleTimerRef = useRef<number | null>(null);

  activeIndexRef.current = activeIndex;
  itemsRef.current = items;
  playingRef.current = playing;
  onNextTrackRef.current = onNextTrack;

  const current = items[activeIndex];
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volumePct = muted ? 0 : volume;
  const activeCaption = useMemo(
    () => findActiveCaption(captionCues, currentTime),
    [captionCues, currentTime],
  );

  useEffect(() => {
    if (!current?.youtubeVideoId) {
      setSubtitleLang('en');
      return;
    }
    setSubtitleLang(readSubtitleLanguageForVideo(current.youtubeVideoId));
  }, [current?.youtubeVideoId]);

  useEffect(() => {
    if (!current?.youtubeVideoId) {
      setCaptionCues([]);
      return;
    }

    let cancelled = false;
    setCaptionCues([]);

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

  const onSubtitleLangChange = useCallback(
    (lang: SubtitleLanguage) => {
      if (!current?.youtubeVideoId) return;
      setSubtitleLang(lang);
      writeSubtitleLanguageForVideo(current.youtubeVideoId, lang);
    },
    [current?.youtubeVideoId],
  );

  const applyVolume = useCallback(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    try {
      if (muted || volume === 0) {
        player.mute();
      } else {
        player.unMute();
        player.setVolume(volume);
      }
    } catch {
      // player not ready
    }
  }, [muted, volume]);

  const syncProgress = useCallback(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    try {
      const nextTime = player.getCurrentTime();
      const nextDuration = player.getDuration();
      setCurrentTime(Number.isFinite(nextTime) ? nextTime : 0);
      setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
    } catch {
      // player not ready
    }
  }, []);

  const loadTrack = useCallback(
    (index: number, autoplay: boolean) => {
      const player = playerRef.current;
      const videoId = itemsRef.current[index]?.youtubeVideoId;
      if (!player || !readyRef.current || !videoId) return;

      ignorePauseUntilRef.current = Date.now() + 3000;
      lastLoadedIndexRef.current = index;
      setCurrentTime(0);
      setDuration(0);

      if (autoplay) {
        playingRef.current = true;
        player.loadVideoById(videoId);
        onPlayingChange(true);
      } else {
        player.cueVideoById(videoId);
      }

      window.setTimeout(syncProgress, 400);
    },
    [onPlayingChange, syncProgress],
  );

  const goNext = useCallback(() => {
    if (onNextTrack) {
      onNextTrack();
      return;
    }
    if (activeIndexRef.current < itemsRef.current.length - 1) {
      const nextIndex = activeIndexRef.current + 1;
      onActiveIndexChange(nextIndex);
      loadTrack(nextIndex, true);
    } else {
      onPlayingChange(false);
    }
  }, [loadTrack, onActiveIndexChange, onPlayingChange, onNextTrack]);

  const goPrev = useCallback(() => {
    if (onPrevTrack) {
      onPrevTrack();
      return;
    }
    if (activeIndexRef.current > 0) {
      const prevIndex = activeIndexRef.current - 1;
      onActiveIndexChange(prevIndex);
      loadTrack(prevIndex, true);
    }
  }, [loadTrack, onActiveIndexChange, onPrevTrack]);

  const nextDisabled =
    canGoNext !== undefined
      ? !canGoNext
      : activeIndex >= items.length - 1 && !onNextTrack;
  const prevDisabled =
    canGoPrev !== undefined ? !canGoPrev : activeIndex <= 0;

  const seekProgressRatio = useCallback(
    (ratio: number) => {
      const player = playerRef.current;
      if (!player || !readyRef.current || duration <= 0) return;
      const target = ratio * duration;
      player.seekTo(target, true);
      setCurrentTime(target);
    },
    [duration],
  );

  const { handleClick: handleProgressClick } = useSeekBarDrag({
    barRef: progressRef,
    enabled: duration > 0,
    onSeekRatio: seekProgressRatio,
  });

  const onProgressKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const player = playerRef.current;
    if (!player || !readyRef.current || duration <= 0) return;
    const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
    if (!step) return;
    e.preventDefault();
    const target = Math.min(duration, Math.max(0, currentTime + step));
    player.seekTo(target, true);
    setCurrentTime(target);
  };

  useEffect(() => {
    if (!items.length) return;

    let cancelled = false;

    void (async () => {
      setPlayerError(null);
      try {
        await loadYoutubeIframeApi();
        if (cancelled || !window.YT?.Player) return;

        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
          readyRef.current = false;
        }

        const startIndex = activeIndexRef.current;
        const startVideo = itemsRef.current[startIndex]?.youtubeVideoId;
        if (!startVideo) return;

        playerRef.current = new window.YT.Player(elementId, {
          videoId: startVideo,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            controls: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: (event) => {
              readyRef.current = true;
              lastLoadedIndexRef.current = activeIndexRef.current;
              try {
                if (muted || volume === 0) event.target.mute();
                else {
                  event.target.unMute();
                  event.target.setVolume(volume);
                }
              } catch {
                // ignore
              }
              syncProgress();
              if (playingRef.current) {
                event.target.playVideo();
                window.setTimeout(() => {
                  if (playingRef.current) {
                    try {
                      event.target.playVideo();
                    } catch {
                      /* ignore */
                    }
                  }
                }, 350);
              }
            },
            onStateChange: (event) => {
              const YTState = window.YT?.PlayerState;
              const ended = YTState?.ENDED ?? 0;
              const playingState = YTState?.PLAYING ?? 1;
              const pausedState = YTState?.PAUSED ?? 2;
              const bufferingState = YTState?.BUFFERING ?? 3;

              if (event.data === ended) {
                if (onNextTrackRef.current) {
                  onNextTrackRef.current();
                  return;
                }
                if (activeIndexRef.current < itemsRef.current.length - 1) {
                  const nextIndex = activeIndexRef.current + 1;
                  const nextId = itemsRef.current[nextIndex]?.youtubeVideoId;
                  if (nextId) {
                    ignorePauseUntilRef.current = Date.now() + 3000;
                    lastLoadedIndexRef.current = nextIndex;
                    playingRef.current = true;
                    onActiveIndexChange(nextIndex);
                    onPlayingChange(true);
                    setCurrentTime(0);
                    setDuration(0);
                    event.target.loadVideoById(nextId);
                  }
                } else {
                  onPlayingChange(false);
                }
                return;
              }

              if (event.data === playingState || event.data === bufferingState) {
                onPlayingChange(true);
              } else if (event.data === pausedState) {
                if (Date.now() < ignorePauseUntilRef.current) return;
                onPlayingChange(false);
              }
              syncProgress();
            },
          },
        });
      } catch {
        if (!cancelled) setPlayerError(t('playlists.playerLoadFailed'));
      }
    })();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
      lastLoadedIndexRef.current = -1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recreate only when list identity changes
  }, [elementId, items.map((i) => i.youtubeVideoId).join('|')]);

  useEffect(() => {
    const player = playerRef.current;
    const videoId = items[activeIndex]?.youtubeVideoId;
    if (!player || !readyRef.current || !videoId) return;

    if (lastLoadedIndexRef.current !== activeIndex) {
      loadTrack(activeIndex, playingRef.current || playing);
      return;
    }

    if (playing) {
      try {
        player.playVideo();
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        if (!playingRef.current || !playerRef.current) return;
        try {
          playerRef.current.playVideo();
        } catch {
          /* ignore */
        }
      }, 300);
    } else {
      player.pauseVideo();
    }
  }, [activeIndex, items, playing, loadTrack]);

  useEffect(() => {
    if (!immersive || !playing || !readyRef.current) return;
    const retryPlay = () => {
      try {
        playerRef.current?.playVideo();
      } catch {
        /* ignore */
      }
    };
    const t1 = window.setTimeout(retryPlay, 500);
    const t2 = window.setTimeout(retryPlay, 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [immersive, playing, activeIndex]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(syncProgress, 250);
    return () => window.clearInterval(id);
  }, [playing, activeIndex, syncProgress]);

  useEffect(() => {
    applyVolume();
  }, [applyVolume]);

  const toggleMute = useCallback(() => {
    setMuted((wasMuted) => {
      if (wasMuted) {
        if (volume === 0) {
          const restored = volumeBeforeMuteRef.current || 100;
          setVolume(restored);
          try {
            localStorage.setItem(VOLUME_STORAGE_KEY, String(restored));
          } catch {
            // ignore
          }
        }
        return false;
      }
      volumeBeforeMuteRef.current = volume > 0 ? volume : volumeBeforeMuteRef.current || 100;
      return true;
    });
  }, [volume]);

  const setVolumeLevel = useCallback((next: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(next)));
    setVolume(clamped);
    if (clamped > 0) setMuted(false);
    volumeBeforeMuteRef.current = clamped > 0 ? clamped : volumeBeforeMuteRef.current;
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);

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

  const onVolumeProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    seekVolumeFromClientX(e.clientX);
  };

  const onVolumeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
    if (!step) return;
    e.preventDefault();
    setVolumeLevel((muted ? 0 : volume) + step);
  };

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const blurIdleControlFocus = useCallback(() => {
    const wrap = frameWrapRef.current;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !wrap?.contains(focused)) return;
    if (focused.getAttribute('role') === 'slider' || focused.tagName === 'SELECT') return;
    focused.blur();
  }, []);

  const scheduleOverlayHide = useCallback(() => {
    clearIdleTimer();
    if (!playingRef.current) return;
    idleTimerRef.current = window.setTimeout(() => {
      const wrap = frameWrapRef.current;
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        wrap?.contains(focused) &&
        (focused.getAttribute('role') === 'slider' || focused.tagName === 'SELECT')
      ) {
        scheduleOverlayHide();
        return;
      }
      blurIdleControlFocus();
      setOverlayVisible(false);
    }, CONTROLS_IDLE_MS);
  }, [clearIdleTimer, blurIdleControlFocus]);

  const bumpPlayerActivity = useCallback(() => {
    setOverlayVisible(true);
    scheduleOverlayHide();
  }, [scheduleOverlayHide]);

  useEffect(() => {
    if (!playing) {
      clearIdleTimer();
      setOverlayVisible(true);
      return;
    }
    bumpPlayerActivity();
    return clearIdleTimer;
  }, [playing, activeIndex, bumpPlayerActivity, clearIdleTimer]);

  useEffect(() => () => clearIdleTimer(), [clearIdleTimer]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const el = frameWrapRef.current;
      const active =
        document.fullscreenElement === el ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ===
          el;
      setIsFullscreen(active);
      if (active && playingRef.current) {
        window.requestAnimationFrame(() => {
          blurIdleControlFocus();
          scheduleOverlayHide();
        });
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, [blurIdleControlFocus, scheduleOverlayHide]);

  useEffect(() => {
    const wrap = frameWrapRef.current;
    if (!wrap || !isFullscreen || !playing) return;

    const onPointerActivity = () => bumpPlayerActivity();
    wrap.addEventListener('mousemove', onPointerActivity);
    wrap.addEventListener('pointermove', onPointerActivity);
    return () => {
      wrap.removeEventListener('mousemove', onPointerActivity);
      wrap.removeEventListener('pointermove', onPointerActivity);
    };
  }, [isFullscreen, playing, bumpPlayerActivity]);

  const toggleFullscreen = useCallback(async () => {
    const el = frameWrapRef.current;
    if (!el) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const elWithWebkit = el as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };

    const isActive =
      document.fullscreenElement === el || doc.webkitFullscreenElement === el;

    try {
      if (isActive) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else {
        await elWithWebkit.webkitRequestFullscreen?.();
      }
      if (playingRef.current) {
        blurIdleControlFocus();
        scheduleOverlayHide();
      }
    } catch {
      // user denied or browser blocked
    }
  }, [blurIdleControlFocus, scheduleOverlayHide]);

  const unlockOrientationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!immersive || !playing) return;

    let cancelled = false;

    void (async () => {
      try {
        playerRef.current?.playVideo();
      } catch {
        /* ignore */
      }

      if (cancelled) return;

      if (lockLandscape) {
        unlockOrientationRef.current = await lockLandscapeOrientation();
      }

      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (cancelled) return;

      const el = frameWrapRef.current;
      if (!el) return;

      try {
        const doc = document as Document & { webkitFullscreenElement?: Element };
        const elWithWebkit = el as HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        };
        if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
          if (el.requestFullscreen) await el.requestFullscreen();
          else await elWithWebkit.webkitRequestFullscreen?.();
        }
      } catch {
        /* 用户拒绝或无全屏 API，继续用 CSS 沉浸 */
      }

      if (!cancelled && playingRef.current) {
        try {
          playerRef.current?.playVideo();
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [immersive, playing, lockLandscape]);

  useEffect(() => {
    if (immersive && lockLandscape) return;

    unlockOrientationRef.current?.();
    unlockOrientationRef.current = null;

    const el = frameWrapRef.current;
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const isActive =
      document.fullscreenElement === el || doc.webkitFullscreenElement === el;
    if (!isActive) return;

    void (async () => {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await (document as Document & { webkitExitFullscreen?: () => Promise<void> })
          .webkitExitFullscreen?.();
      } catch {
        /* ignore */
      }
    })();
  }, [immersive, lockLandscape]);

  if (!items.length || !current) return null;

  const controlBar = (
    <div className="youtube-player-bar">
            <div className="youtube-player-transport">
              <button
                type="button"
                className="youtube-player-icon-btn"
                onClick={goPrev}
                disabled={prevDisabled}
                aria-label={t('playlists.prevTrack')}
              >
                ‹
              </button>
              <button
                type="button"
                className="youtube-player-icon-btn youtube-player-icon-btn-primary"
                onClick={() => onPlayingChange(!playing)}
                aria-label={playing ? t('playlists.pause') : t('playlists.play')}
              >
                {playing ? '▮▮' : '▶'}
              </button>
              <button
                type="button"
                className="youtube-player-icon-btn"
                onClick={goNext}
                disabled={nextDisabled}
                aria-label={t('playlists.nextTrack')}
              >
                ›
              </button>
            </div>

            <div
              ref={progressRef}
              className="youtube-player-progress"
              role="slider"
              tabIndex={0}
              aria-label={t('playlists.seek')}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              onClick={(e) => handleProgressClick(e.clientX)}
              onKeyDown={onProgressKeyDown}
            >
              <div className="youtube-player-progress-track">
                <div
                  className="youtube-player-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
                <div
                  className="youtube-player-progress-thumb"
                  style={{ left: `${progressPct}%` }}
                />
              </div>
            </div>

            <span className="youtube-player-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div
              className="youtube-player-subtitle-toggle"
              role="group"
              aria-label={t('playlists.subtitleLanguage')}
            >
              <button
                type="button"
                className={`youtube-player-subtitle-toggle-btn${subtitleLang === 'en' ? ' active' : ''}`}
                onClick={() => onSubtitleLangChange('en')}
                aria-pressed={subtitleLang === 'en'}
              >
                {t('playlists.subtitleEnglishShort')}
              </button>
              <button
                type="button"
                className={`youtube-player-subtitle-toggle-btn${subtitleLang === 'zh' ? ' active' : ''}`}
                onClick={() => onSubtitleLangChange('zh')}
                aria-pressed={subtitleLang === 'zh'}
              >
                {t('playlists.subtitleChineseShort')}
              </button>
            </div>

            <div className="youtube-player-volume">
              <div
                ref={volumeProgressRef}
                className="youtube-player-volume-progress"
                role="slider"
                tabIndex={0}
                aria-label={t('playlists.volume')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={volumePct}
                onClick={onVolumeProgressClick}
                onKeyDown={onVolumeKeyDown}
              >
                <div className="youtube-player-volume-progress-track">
                  <div
                    className="youtube-player-volume-progress-fill"
                    style={{ width: `${volumePct}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                className="youtube-player-icon-btn youtube-player-volume-btn"
                onClick={toggleMute}
                aria-label={muted || volume === 0 ? t('playlists.unmute') : t('playlists.mute')}
                title={muted || volume === 0 ? t('playlists.unmute') : t('playlists.mute')}
              >
                {muted || volume === 0 ? (
                  <svg className="youtube-player-volume-icon" viewBox="0 0 16 16" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zM11.8 4.2 11 5l2 2-2 2 .8.8 2.8-2.8L14.6 6l-2.8-2.8zM9 6.4 10.6 8 9 9.6V6.4z"
                    />
                  </svg>
                ) : volume < 50 ? (
                  <svg className="youtube-player-volume-icon" viewBox="0 0 16 16" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zm5.5 2.5a3.5 3.5 0 0 1 0 5v-1.5a2 2 0 0 0 0-2v-1.5z"
                    />
                  </svg>
                ) : (
                  <svg className="youtube-player-volume-icon" viewBox="0 0 16 16" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zm5.5 2.5a3.5 3.5 0 0 1 0 5v-1.5a2 2 0 0 0 0-2v-1.5zm2-5a6.5 6.5 0 0 1 0 11v-1.5a5 5 0 0 0 0-8v-1.5z"
                    />
                  </svg>
                )}
              </button>
            </div>

            {!immersive && (
              <button
                type="button"
                className="youtube-player-icon-btn youtube-player-fullscreen-btn"
                onClick={() => void toggleFullscreen()}
                aria-label={isFullscreen ? t('playlists.exitFullscreen') : t('playlists.fullscreen')}
                title={isFullscreen ? t('playlists.exitFullscreen') : t('playlists.fullscreen')}
              >
                {isFullscreen ? (
                  <svg className="youtube-player-fs-icon" viewBox="0 0 16 16" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M3 9v4h4v-1H4V9H3zm9-5H9v1h3v3h1V4zm-9 0v1h3V4H3zm9 9h-1v3H9v1h4V9z"
                    />
                  </svg>
                ) : (
                  <svg className="youtube-player-fs-icon" viewBox="0 0 16 16" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M2 6V2h4V1H1v5h1zm8-5v1h4v4h1V1h-5zM1 10h1v4h4v1H1v-5zm13 5v-1h-4v-1h5v5h-1z"
                    />
                  </svg>
                )}
              </button>
            )}
    </div>
  );

  const controlMeta = (
    <div className="youtube-player-overlay-meta">
      <span className="youtube-player-overlay-title">{current.title}</span>
      <span className="youtube-player-overlay-index">
        {t('playlists.trackCounter', { current: activeIndex + 1, total: items.length })}
      </span>
    </div>
  );

  const controlsPanel = (
    <>
      {controlMeta}
      {controlBar}
    </>
  );

  return (
    <section
      className={`youtube-player-section${immersive ? ' youtube-player-section--mobile-immersive youtube-player-section--immersive' : ''}`}
      aria-label={t('playlists.playerSection')}
    >
      <div
        ref={frameWrapRef}
        className={`youtube-player-frame-wrap${isFullscreen ? ' is-fullscreen' : ''}${
          overlayVisible ? '' : ' controls-idle'
        }`}
        onMouseEnter={bumpPlayerActivity}
        onMouseMove={isFullscreen ? bumpPlayerActivity : undefined}
      >
        <div id={elementId} className="youtube-player-frame" />

        <div
          className="youtube-player-hit-area"
          onMouseMove={bumpPlayerActivity}
          onTouchStart={bumpPlayerActivity}
          onClick={bumpPlayerActivity}
          aria-hidden
        />

        {immersive && mobileChrome && (
          <div className="youtube-player-mobile-chrome">{mobileChrome}</div>
        )}

        {activeCaption && (
          <div className="youtube-player-subtitles" aria-live="polite">
            <p className="youtube-player-subtitle-text">{activeCaption}</p>
          </div>
        )}

        <div
          className={`youtube-player-overlay${overlayVisible ? '' : ' is-hidden'}`}
          aria-hidden={!overlayVisible}
          onMouseMove={bumpPlayerActivity}
          onFocusCapture={bumpPlayerActivity}
          onTouchStart={bumpPlayerActivity}
        >
          {controlsPanel}
        </div>
      </div>

      {playerError && <p className="error-msg">{playerError}</p>}
    </section>
  );
}
