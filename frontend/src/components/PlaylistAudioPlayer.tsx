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
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [subtitleLang, setSubtitleLang] = useState<SubtitleLanguage>('en');

  const current = items[activeIndex];
  const audioStatus = current?.audio;
  const isReady = audioStatus?.status === 'ready';
  const isProcessing =
    audioStatus?.status === 'pending' || audioStatus?.status === 'processing';
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
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
    if (!current?.youtubeVideoId || !isReady) {
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
  }, [current?.youtubeVideoId, isReady, subtitleLang]);

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
      return;
    }

    let cancelled = false;
    setLoadingStream(true);
    setPlayerError(null);
    setStreamUrl(null);
    setCurrentTime(0);
    setDuration(0);

    void (async () => {
      try {
        let status = audioStatus;
        if (!status || status.status !== 'ready') {
          status = (await refreshAudioStatus(videoId)) ?? status;
        }
        if (!status || status.status !== 'ready') {
          if (!cancelled) setLoadingStream(false);
          return;
        }

        const { url } =
          status.streamUrl && status.expiresAt
            ? { url: status.streamUrl }
            : await getYoutubeAudioStreamUrl(videoId);

        if (!cancelled) {
          setStreamUrl(resolveStreamSrc(url));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when track or ready state changes
  }, [current?.youtubeVideoId, audioStatus?.status, audioStatus?.blobId]);

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
          <div className="playlist-audio-subtitles" aria-live="polite">
            <p>{activeCaption}</p>
          </div>
        )}
      </div>

      {isProcessing && (
        <p className="playlists-muted playlist-audio-status">
          {t('playlists.audioCaching', { title: current.title })}
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
        </div>
      </div>
    </section>
  );
}
