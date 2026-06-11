import { useCallback, useEffect, useRef, type RefObject } from 'react';

type UseSeekBarDragOptions = {
  barRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onSeekRatio: (ratio: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
};

/**
 * 进度条点击 / 拖动 seek。统一用 Pointer Events + capture，兼容 iOS Safari。
 */
export function useSeekBarDrag({
  barRef,
  enabled,
  onSeekRatio,
  onScrubStart,
  onScrubEnd,
}: UseSeekBarDragOptions) {
  const enabledRef = useRef(enabled);
  const onSeekRatioRef = useRef(onSeekRatio);
  const onScrubStartRef = useRef(onScrubStart);
  const onScrubEndRef = useRef(onScrubEnd);
  const suppressClickRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const scrubbingRef = useRef(false);

  enabledRef.current = enabled;
  onSeekRatioRef.current = onSeekRatio;
  onScrubStartRef.current = onScrubStart;
  onScrubEndRef.current = onScrubEnd;

  const seekFromClientX = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar || !enabledRef.current) return;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeekRatioRef.current(ratio);
  }, [barRef]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let removeWindowListeners: (() => void) | null = null;

    const beginDrag = () => {
      if (!scrubbingRef.current) {
        scrubbingRef.current = true;
        onScrubStartRef.current?.();
      }
    };

    const finishDrag = () => {
      removeWindowListeners?.();
      removeWindowListeners = null;

      const pointerId = activePointerIdRef.current;
      activePointerIdRef.current = null;

      if (pointerId !== null && bar.hasPointerCapture(pointerId)) {
        try {
          bar.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
      }

      if (scrubbingRef.current) {
        scrubbingRef.current = false;
        onScrubEndRef.current?.();
      }

      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 400);
    };

    const attachWindowEndListeners = () => {
      if (removeWindowListeners) return;

      const onWindowPointerEnd = (e: PointerEvent) => {
        if (activePointerIdRef.current !== e.pointerId) return;
        finishDrag();
      };

      window.addEventListener('pointerup', onWindowPointerEnd);
      window.addEventListener('pointercancel', onWindowPointerEnd);
      removeWindowListeners = () => {
        window.removeEventListener('pointerup', onWindowPointerEnd);
        window.removeEventListener('pointercancel', onWindowPointerEnd);
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!enabledRef.current || e.button !== 0) return;
      if (activePointerIdRef.current !== null) return;

      activePointerIdRef.current = e.pointerId;
      e.preventDefault();
      beginDrag();
      attachWindowEndListeners();

      try {
        bar.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      seekFromClientX(e.clientX);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      seekFromClientX(e.clientX);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      finishDrag();
    };

    bar.addEventListener('pointerdown', onPointerDown);
    bar.addEventListener('pointermove', onPointerMove);
    bar.addEventListener('pointerup', onPointerUp);
    bar.addEventListener('pointercancel', onPointerUp);

    return () => {
      bar.removeEventListener('pointerdown', onPointerDown);
      bar.removeEventListener('pointermove', onPointerMove);
      bar.removeEventListener('pointerup', onPointerUp);
      bar.removeEventListener('pointercancel', onPointerUp);
      if (scrubbingRef.current) {
        finishDrag();
      } else {
        removeWindowListeners?.();
      }
    };
  }, [barRef, enabled, seekFromClientX]);

  const handleClick = useCallback(
    (clientX: number) => {
      if (suppressClickRef.current) return;
      seekFromClientX(clientX);
    },
    [seekFromClientX],
  );

  return { handleClick };
}
