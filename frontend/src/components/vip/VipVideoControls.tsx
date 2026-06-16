import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import AudioSeekBar from '../AudioSeekBar';
import { useI18n } from '../../i18n';
import {
  readStoredPlayerVolume,
  writeStoredPlayerVolume,
} from '../../lib/player-volume';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function VolumeIcon({ level, muted }: { level: number; muted: boolean }) {
  if (muted || level === 0) {
    return (
      <svg className="audio-volume-icon" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M8.5 2.5L5 6H2v4h3l3.5 3.5V2.5zM11.5 8a3.5 3.5 0 00-1.5-2.86v5.72A3.5 3.5 0 0011.5 8z"
        />
        <path stroke="currentColor" strokeWidth="1.2" d="M13 5l-4 6M9 5l4 6" />
      </svg>
    );
  }
  if (level < 50) {
    return (
      <svg className="audio-volume-icon" viewBox="0 0 16 16" aria-hidden>
        <path fill="currentColor" d="M8.5 2.5L5 6H2v4h3l3.5 3.5V2.5zM11.5 8a3.5 3.5 0 00-1.5-2.86v5.72A3.5 3.5 0 0011.5 8z" />
      </svg>
    );
  }
  return (
    <svg className="audio-volume-icon" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M8.5 2.5L5 6H2v4h3l3.5 3.5V2.5zM11.5 8a3.5 3.5 0 00-1.5-2.86v5.72A3.5 3.5 0 0011.5 8zm2.2-2.2a5.5 5.5 0 010 8.4V5.8a5.5 5.5 0 00-2.2-5.5z"
      />
    </svg>
  );
}

type VipVideoControlsProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  isLoading: boolean;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  currentTime: number;
  duration: number;
  isMobile?: boolean;
};

export default function VipVideoControls({
  videoRef,
  isReady,
  isLoading,
  playing,
  onPlayingChange,
  currentTime,
  duration,
  isMobile = false,
}: VipVideoControlsProps) {
  const { t } = useI18n();
  const volumeProgressRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(readStoredPlayerVolume);
  const [muted, setMuted] = useState(false);
  const volumeBeforeMuteRef = useRef(volume);

  const volumePct = muted ? 0 : volume;
  const canSeek = isReady && Number.isFinite(duration) && duration > 0;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = Math.min(1, Math.max(0, volume / 100));
    el.muted = muted || volume === 0;
  }, [videoRef, volume, muted, isReady]);

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
      const el = videoRef.current;
      if (!el || !canSeek) return;
      const next = ratio * duration;
      el.currentTime = next;
    },
    [canSeek, duration, videoRef],
  );

  const togglePlay = () => {
    if (!isReady || isLoading) return;
    onPlayingChange(!playing);
  };

  return (
    <div
      className={`vip-video-controls-bar${isMobile ? ' vip-video-controls-bar--mobile' : ''}`}
      role="group"
      aria-label={t('vipVideo.playerControls')}
    >
      <AudioSeekBar
        currentTime={currentTime}
        duration={duration}
        canSeek={canSeek}
        onSeekRatio={seekToRatio}
        className="vip-video-seek"
      />
      <div className="vip-video-controls-row">
        <button
          type="button"
          className="btn-primary vip-video-play-btn"
          disabled={!isReady}
          onClick={togglePlay}
          aria-busy={isLoading || undefined}
          aria-label={
            isLoading ? t('vipVideo.loading') : playing ? t('vipVideo.pause') : t('vipVideo.play')
          }
        >
          {isLoading ? (
            <span className="vip-video-loading-spinner vip-video-loading-spinner--btn" aria-hidden />
          ) : playing ? (
            t('vipVideo.pause')
          ) : (
            t('vipVideo.play')
          )}
        </button>
        <span className="vip-video-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="audio-volume vip-video-volume">
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
      </div>
    </div>
  );
}
