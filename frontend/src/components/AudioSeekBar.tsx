import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n';
import { useSeekBarDrag } from '../hooks/useSeekBarDrag';

const SCRUB_DRIFT_HEAL_SEC = 1.25;

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
  const [scrubActive, setScrubActive] = useState(false);
  const [scrubPreview, setScrubPreview] = useState(0);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const showIndeterminate = usingPreview && !hasDuration;
  const showProgress = hasDuration || scrubActive;

  const progressPct = scrubActive
    ? scrubPreview * 100
    : hasDuration
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;

  const clearScrubState = () => {
    setScrubActive(false);
    setScrubPreview(0);
  };

  useEffect(() => {
    if (!scrubActive || !hasDuration) return;
    const expected = scrubPreview * duration;
    if (Math.abs(currentTime - expected) > SCRUB_DRIFT_HEAL_SEC) {
      clearScrubState();
      onScrubEnd?.();
    }
  }, [currentTime, scrubActive, scrubPreview, duration, hasDuration, onScrubEnd]);

  useEffect(() => {
    clearScrubState();
  }, [duration]);

  const { handleClick } = useSeekBarDrag({
    barRef,
    enabled: canSeek,
    onSeekRatio: (ratio) => {
      setScrubPreview(ratio);
      onSeekRatio(ratio);
    },
    onScrubStart: () => {
      const ratio = hasDuration ? currentTime / duration : 0;
      setScrubActive(true);
      setScrubPreview(ratio);
      onScrubStart?.();
    },
    onScrubEnd: () => {
      clearScrubState();
      onScrubEnd?.();
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
