import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
};

function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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
}: PlaylistAudioPlayerProps) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const volumeProgressRef = useRef<HTMLDivElement>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [usingPreview, setUsingPreview] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [subtitleLang, setSubtitleLang] = useState<SubtitleLanguage>('en');
  const [volume, setVolume] = useState(readStoredPlayerVolume);
  const [muted, setMuted] = useState(false);
  const volumeBeforeMuteRef = useRef(volume);

  const current = items[activeIndex];
  const audioStatus = current?.audio;
  const isReady = audioStatus?.status === 'ready';
  const isProcessing =
    audioStatus?.status === 'pending' || audioStatus?.status === 'processing';
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volumePct = muted ? 0 : volume;
  const activeCaption = useMemo(
    () => findActiveCaption(captionCues, currentTime),
    [captionCues, currentTime],
  );

  const refreshAudioStatus = useCallback(
    async (videoId: string) => {
      try {
        const status = await getYoutubeAudioStatus(videoId);
        onAudioStatusChange?.(videoId, status);
        return status;
      } catch {
        return null;
      }
    },
    [onAudioStatusChange],
  );

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

    void (async () => {
      try {
        const status = (await refreshAudioStatus(videoId)) ?? audioStatus;
        if (!status || cancelled) {
          if (!cancelled) setLoadingStream(false);
          return;
        }

        let url: string | null = null;
        let preview = false;
        if (status.status === 'ready') {
          if (status.streamUrl) {
            url = status.streamUrl;
          } else {
            const streamed = await getYoutubeAudioStreamUrl(videoId);
            url = streamed.url;
          }
        } else if (status.previewStreamUrl) {
          url = status.previewStreamUrl;
          preview = true;
        }

        if (!url) {
          if (!cancelled) setLoadingStream(false);
          return;
        }

        if (!cancelled) {
          setStreamUrl(resolveStreamSrc(url));
          setUsingPreview(preview);
          setLoadingStream(false);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 换歌时重新选流，不因后台缓存完成而中断当前播放
  }, [current?.youtubeVideoId]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !streamUrl) return;
    el.load();
    if (playing) void el.play().catch(() => onPlayingChange(false));
  }, [streamUrl, playing, onPlayingChange]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) void el.play().catch(() => onPlayingChange(false));
    else el.pause();
  }, [playing, onPlayingChange]);

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

  const goNext = useCallback(() => {
    if (onNextTrack) {
      onNextTrack();
      return;
    }
    if (activeIndex < items.length - 1) {
      onActiveIndexChange(activeIndex + 1);
      onPlayingChange(true);
    } else {
      onPlayingChange(false);
    }
  }, [activeIndex, items.length, onActiveIndexChange, onPlayingChange, onNextTrack]);

  const goPrev = useCallback(() => {
    if (onPrevTrack) {
      onPrevTrack();
      return;
    }
    if (activeIndex > 0) {
      onActiveIndexChange(activeIndex - 1);
      onPlayingChange(true);
    }
  }, [activeIndex, onActiveIndexChange, onPlayingChange, onPrevTrack]);

  const nextDisabled =
    canGoNext !== undefined ? !canGoNext : activeIndex >= items.length - 1 && !onNextTrack;
  const prevDisabled = canGoPrev !== undefined ? !canGoPrev : activeIndex <= 0;

  if (!current) return null;

  return (
    <section className="playlist-audio-player" aria-label={t('playlists.playerSectionAudio')}>
      <div className="playlist-audio-artwork-wrap">
        <img
          className="playlist-audio-artwork"
          src={youtubeThumb(current.youtubeVideoId)}
          alt=""
          loading="lazy"
        />
        {activeCaption && (
          <div className="playlist-audio-subtitles playlist-audio-subtitles-overlay" aria-live="polite">
            <p>{activeCaption}</p>
          </div>
        )}
      </div>

      <div className="playlist-audio-lyrics-panel mobile-only" aria-live="polite">
        {activeCaption ? (
          <p className="playlist-audio-lyrics-text">{activeCaption}</p>
        ) : (
          <p className="playlist-audio-lyrics-empty">{t('playlists.noLyricsYet')}</p>
        )}
      </div>

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

      <audio
        ref={audioRef}
        className="playlist-audio-element"
        src={streamUrl ?? undefined}
        preload="metadata"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={goNext}
        onPlay={() => onPlayingChange(true)}
        onPause={() => onPlayingChange(false)}
      />

      <div className="playlist-audio-controls">
        <div className="playlist-audio-meta">
          <span className="playlist-audio-title">{current.title}</span>
          <span className="playlist-audio-index">
            {t('playlists.trackCounter', { current: activeIndex + 1, total: items.length })}
          </span>
        </div>

        <div className="playlist-audio-bar">
          <div className="playlist-audio-transport">
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
              disabled={!streamUrl || loadingStream}
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
            className="youtube-player-progress"
            role="slider"
            tabIndex={0}
            aria-label={t('playlists.seek')}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            onClick={(e) => {
              const el = audioRef.current;
              if (!el || duration <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              el.currentTime = ratio * duration;
            }}
          >
            <div className="youtube-player-progress-track">
              <div className="youtube-player-progress-fill" style={{ width: `${progressPct}%` }} />
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
              onClick={() => {
                setSubtitleLang('en');
                writeSubtitleLanguageForVideo(current.youtubeVideoId, 'en');
              }}
            >
              {t('playlists.subtitleEnglishShort')}
            </button>
            <button
              type="button"
              className={`youtube-player-subtitle-toggle-btn${subtitleLang === 'zh' ? ' active' : ''}`}
              onClick={() => {
                setSubtitleLang('zh');
                writeSubtitleLanguageForVideo(current.youtubeVideoId, 'zh');
              }}
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
              onClick={(e) => seekVolumeFromClientX(e.clientX)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault();
                const step = e.key === 'ArrowRight' ? 5 : -5;
                setVolumeLevel((muted ? 0 : volume) + step);
              }}
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
        </div>
      </div>
    </section>
  );
}
