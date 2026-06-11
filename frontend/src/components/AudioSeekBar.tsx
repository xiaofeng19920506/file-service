import { useRef, type KeyboardEvent } from 'react';
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

  const progressPct =
    canSeek && duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const { handleClick } = useSeekBarDrag({
    barRef,
    enabled: canSeek,
    onSeekRatio,
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek || duration <= 0) return;
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
      aria-valuemax={canSeek ? duration : 0}
      aria-valuenow={currentTime}
      aria-disabled={!canSeek}
      onClick={(e) => handleClick(e.clientX)}
      onKeyDown={handleKeyDown}
    >
      <div className="audio-progress-track">
        <div
          className={`audio-progress-fill${usingPreview ? ' audio-progress-fill--indeterminate' : ''}`}
          style={canSeek ? { width: `${progressPct}%` } : undefined}
        />
        {canSeek && (
          <div className="audio-progress-thumb" style={{ left: `${progressPct}%` }} aria-hidden />
        )}
      </div>
    </div>
  );
}
