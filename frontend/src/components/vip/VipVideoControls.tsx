import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useI18n } from '../../i18n';
import { useSeekBarDrag } from '../../hooks/useSeekBarDrag';
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
      <svg className="youtube-player-volume-icon" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zM11.8 4.2 11 5l2 2-2 2 .8.8 2.8-2.8L14.6 6l-2.8-2.8zM9 6.4 10.6 8 9 9.6V6.4z"
        />
      </svg>
    );
  }
  if (level < 50) {
    return (
      <svg className="youtube-player-volume-icon" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zm5.5 2.5a3.5 3.5 0 0 1 0 5v-1.5a2 2 0 0 0 0-2v-1.5z"
        />
      </svg>
    );
  }
  return (
    <svg className="youtube-player-volume-icon" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M2 5.5v5h2.5L8 14V2L4.5 5.5H2zm5.5 2.5a3.5 3.5 0 0 1 0 5v-1.5a2 2 0 0 0 0-2v-1.5zm2-5a6.5 6.5 0 0 1 0 11v-1.5a5 5 0 0 0 0-8v-1.5z"
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
  variant?: 'overlay' | 'dock';
};

export default function VipVideoControls({
  videoRef,
  isReady,
  isLoading,
  playing,
  onPlayingChange,
  currentTime,
  duration,
  variant = 'overlay',
}: VipVideoControlsProps) {
  const { t } = useI18n();
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeProgressRef = useRef<HTMLDivElement>(null);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [volume, setVolume] = useState(readStoredPlayerVolume);
  const [muted, setMuted] = useState(false);
  const volumeBeforeMuteRef = useRef(volume);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const canSeek = isReady && hasDuration;
  const volumePct = muted ? 0 : volume;
  const progressPct =
    scrubRatio !== null
      ? scrubRatio * 100
      : hasDuration
        ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
        : 0;

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
      const clamped = Math.min(1, Math.max(0, ratio));
      setScrubRatio(clamped);
      el.currentTime = clamped * duration;
    },
    [canSeek, duration, videoRef],
  );

  const { handleClick: handleProgressClick } = useSeekBarDrag({
    barRef: progressRef,
    enabled: canSeek,
    onSeekRatio: seekToRatio,
    onScrubStart: () => {
      if (hasDuration) {
        setScrubRatio(Math.min(1, Math.max(0, currentTime / duration)));
      }
    },
    onScrubEnd: () => {
      setScrubRatio(null);
    },
  });

  const onProgressKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
    if (!step) return;
    e.preventDefault();
    const ratio = Math.min(1, Math.max(0, currentTime / duration + step / duration));
    seekToRatio(ratio);
  };

  const togglePlay = () => {
    if (!isReady || isLoading) return;
    onPlayingChange(!playing);
  };

  const isDock = variant === 'dock';

  const progressBar = (
    <div
      ref={progressRef}
      className={`youtube-player-progress vip-video-progress${canSeek ? '' : ' vip-video-progress--disabled'}${isDock ? ' vip-video-progress--dock' : ''}`}
      role="slider"
      tabIndex={canSeek ? 0 : -1}
      aria-label={t('playlists.seek')}
      aria-valuemin={0}
      aria-valuemax={hasDuration ? duration : 0}
      aria-valuenow={scrubRatio !== null && hasDuration ? scrubRatio * duration : currentTime}
      aria-disabled={!canSeek}
      onClick={(e) => handleProgressClick(e.clientX)}
      onKeyDown={onProgressKeyDown}
    >
      <div className="youtube-player-progress-track">
        <div className="youtube-player-progress-fill" style={{ width: `${progressPct}%` }} />
        {hasDuration && (
          <div className="youtube-player-progress-thumb" style={{ left: `${progressPct}%` }} aria-hidden />
        )}
      </div>
    </div>
  );

  const transportRow = (
    <div className="vip-video-controls-row">
      <button
        type="button"
        className={`youtube-player-icon-btn youtube-player-icon-btn-primary vip-video-play-btn${isDock ? ' vip-video-play-btn--dock' : ''}`}
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
          '▮▮'
        ) : (
          '▶'
        )}
      </button>

      <span className={`youtube-player-time vip-video-time${isDock ? ' vip-video-time--dock' : ''}`}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <div className={`youtube-player-volume vip-video-volume${isDock ? ' vip-video-volume--dock' : ''}`}>
        <div
          ref={volumeProgressRef}
          className={`youtube-player-volume-progress${isDock ? ' vip-video-volume-progress--dock' : ''}`}
          role="slider"
          tabIndex={0}
          aria-label={t('playlists.volume')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={volumePct}
          onClick={(e) => seekVolumeFromClientX(e.clientX)}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
            if (!step) return;
            e.preventDefault();
            setVolumeLevel((muted ? 0 : volume) + step);
          }}
        >
          <div className="youtube-player-volume-progress-track">
            <div className="youtube-player-volume-progress-fill" style={{ width: `${volumePct}%` }} />
          </div>
        </div>
        <button
          type="button"
          className={`youtube-player-icon-btn youtube-player-volume-btn${isDock ? ' vip-video-volume-btn--dock' : ''}`}
          onClick={toggleMute}
          aria-label={muted || volume === 0 ? t('playlists.unmute') : t('playlists.mute')}
        >
          <VolumeIcon level={volume} muted={muted || volume === 0} />
        </button>
      </div>
    </div>
  );

  if (isDock) {
    return (
      <div className="vip-video-controls-dock" role="group" aria-label={t('vipVideo.playerControls')}>
        {progressBar}
        {transportRow}
      </div>
    );
  }

  return (
    <div className="vip-video-controls-overlay" role="group" aria-label={t('vipVideo.playerControls')}>
      {progressBar}
      {transportRow}
    </div>
  );
}
