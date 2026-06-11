import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useI18n } from '../i18n';

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
  const seekingRef = useRef(false);

  const progressPct =
    canSeek && duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || !canSeek) return;
      const rect = bar.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeekRatio(ratio);
    },
    [canSeek, onSeekRatio],
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!canSeek) return;
      e.preventDefault();
      seekingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      seekFromClientX(e.clientX);

      const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
        if (!seekingRef.current) return;
        seekFromClientX(moveEvent.clientX);
      };
      const onPointerUp = () => {
        seekingRef.current = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [canSeek, seekFromClientX],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!canSeek || duration <= 0) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = (e.key === 'ArrowRight' ? 5 : -5) / duration;
        const ratio = Math.min(1, Math.max(0, currentTime / duration + step));
        onSeekRatio(ratio);
      }
    },
    [canSeek, currentTime, duration, onSeekRatio],
  );

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
      onPointerDown={handlePointerDown}
      onClick={(e) => seekFromClientX(e.clientX)}
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
