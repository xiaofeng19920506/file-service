import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n';
import { useSeekBarDrag } from '../hooks/useSeekBarDrag';

type AudioSeekBarProps = {
  currentTime: number;
  duration: number;
  canSeek: boolean;
  usingPreview?: boolean;
  onSeekRatio: (ratio: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  className?: string;
};

export default function AudioSeekBar({
  currentTime,
  duration,
  canSeek,
  usingPreview = false,
  onSeekRatio,
  onScrubStart,
  onScrubEnd,
  className = '',
}: AudioSeekBarProps) {
  const { t } = useI18n();
  const barRef = useRef<HTMLDivElement>(null);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const showIndeterminate = usingPreview && !hasDuration && currentTime <= 0;
  const progressPct =
    scrubRatio !== null
      ? scrubRatio * 100
      : hasDuration
        ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
        : 0;

  const handleSeekRatio = useCallback(
    (ratio: number) => {
      setScrubRatio(ratio);
      onSeekRatio(ratio);
    },
    [onSeekRatio],
  );

  const handleScrubStart = useCallback(() => {
    if (hasDuration) {
      setScrubRatio(Math.min(1, Math.max(0, currentTime / duration)));
    }
    onScrubStart?.();
  }, [currentTime, duration, hasDuration, onScrubStart]);

  const handleScrubEnd = useCallback(() => {
    setScrubRatio(null);
    onScrubEnd?.();
  }, [onScrubEnd]);

  const { handleClick } = useSeekBarDrag({
    barRef,
    enabled: canSeek,
    onSeekRatio: handleSeekRatio,
    onScrubStart: handleScrubStart,
    onScrubEnd: handleScrubEnd,
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek || !hasDuration) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.key === 'ArrowRight' ? 5 : -5) / duration;
      const ratio = Math.min(1, Math.max(0, currentTime / duration + step));
      handleSeekRatio(ratio);
    }
  };

  return (
    <div
      ref={barRef}
      className={`audio-progress${canSeek ? '' : ' audio-progress--disabled'}${className ? ` ${className}` : ''}`}
      role="slider"
      tabIndex={canSeek ? 0 : -1}
      aria-label={t('playlists.seek')}
      aria-valuemin={0}
      aria-valuemax={hasDuration ? duration : 0}
      aria-valuenow={scrubRatio !== null && hasDuration ? scrubRatio * duration : currentTime}
      aria-disabled={!canSeek}
      onClick={(e) => handleClick(e.clientX)}
      onKeyDown={handleKeyDown}
    >
      <div className="audio-progress-track">
        <div
          className={`audio-progress-fill${showIndeterminate ? ' audio-progress-fill--indeterminate' : ''}`}
          style={hasDuration && !showIndeterminate ? { width: `${progressPct}%` } : undefined}
        />
        {hasDuration && !showIndeterminate && (
          <div className="audio-progress-thumb" style={{ left: `${progressPct}%` }} aria-hidden />
        )}
      </div>
    </div>
  );
}
