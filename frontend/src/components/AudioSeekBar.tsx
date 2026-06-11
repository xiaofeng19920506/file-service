import { useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n';
import { useSeekBarDrag } from '../hooks/useSeekBarDrag';

type AudioSeekBarProps = {
  currentTime: number;
  duration: number;
  canSeek: boolean;
  usingPreview?: boolean;
  onSeekRatio: (ratio: number) => void;
  className?: string;
};

export default function AudioSeekBar({
  currentTime,
  duration,
  canSeek,
  usingPreview = false,
  onSeekRatio,
  className = '',
}: AudioSeekBarProps) {
  const { t } = useI18n();
  const barRef = useRef<HTMLDivElement>(null);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const showIndeterminate = usingPreview && !hasDuration;
  const showProgress = hasDuration || scrubRatio !== null;

  const progressPct =
    scrubRatio !== null
      ? scrubRatio * 100
      : hasDuration
        ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
        : 0;

  const { handleClick } = useSeekBarDrag({
    barRef,
    enabled: canSeek,
    onSeekRatio: (ratio) => {
      setScrubRatio(ratio);
      onSeekRatio(ratio);
    },
    onScrubStart: () => {
      setScrubRatio((prev) => prev ?? (hasDuration ? currentTime / duration : 0));
    },
    onScrubEnd: () => {
      setScrubRatio(null);
    },
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek || !hasDuration) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.key === 'ArrowRight' ? 5 : -5) / duration;
      const ratio = Math.min(1, Math.max(0, currentTime / duration + step));
      onSeekRatio(ratio);
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
      aria-valuenow={currentTime}
      aria-disabled={!canSeek}
      onClick={(e) => handleClick(e.clientX)}
      onKeyDown={handleKeyDown}
    >
      <div className="audio-progress-track">
        <div
          className={`audio-progress-fill${showIndeterminate ? ' audio-progress-fill--indeterminate' : ''}`}
          style={showProgress && !showIndeterminate ? { width: `${progressPct}%` } : undefined}
        />
        {showProgress && !showIndeterminate && (
          <div className="audio-progress-thumb" style={{ left: `${progressPct}%` }} aria-hidden />
        )}
      </div>
    </div>
  );
}
