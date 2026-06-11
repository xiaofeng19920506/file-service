import { useCallback, useEffect, useRef, type RefObject } from 'react';

type UseSeekBarDragOptions = {
  barRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onSeekRatio: (ratio: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
};

/**
 * 进度条点击 / 拖动 seek。Pointer + Touch 双通道（iOS 上 touch 比 pointer 更可靠）。
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
  const touchDragRef = useRef(false);
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
      activePointerIdRef.current = null;
      touchDragRef.current = false;

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
        if (!touchDragRef.current && activePointerIdRef.current !== e.pointerId) return;
        finishDrag();
      };

      const onWindowTouchEnd = () => {
        if (!touchDragRef.current) return;
        finishDrag();
      };

      window.addEventListener('pointerup', onWindowPointerEnd);
      window.addEventListener('pointercancel', onWindowPointerEnd);
      window.addEventListener('touchend', onWindowTouchEnd, { passive: false });
      window.addEventListener('touchcancel', onWindowTouchEnd, { passive: false });

      removeWindowListeners = () => {
        window.removeEventListener('pointerup', onWindowPointerEnd);
        window.removeEventListener('pointercancel', onWindowPointerEnd);
        window.removeEventListener('touchend', onWindowTouchEnd);
        window.removeEventListener('touchcancel', onWindowTouchEnd);
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || touchDragRef.current) return;
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
      if (e.pointerType === 'touch' || touchDragRef.current) return;
      if (activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      seekFromClientX(e.clientX);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || touchDragRef.current) return;
      if (activePointerIdRef.current !== e.pointerId) return;
      try {
        if (bar.hasPointerCapture(e.pointerId)) {
          bar.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      finishDrag();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      touchDragRef.current = true;
      beginDrag();
      attachWindowEndListeners();
      seekFromClientX(e.touches[0]!.clientX);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchDragRef.current || !enabledRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      seekFromClientX(e.touches[0]!.clientX);
    };

    const onTouchEnd = () => {
      if (!touchDragRef.current) return;
      finishDrag();
    };

    bar.addEventListener('pointerdown', onPointerDown);
    bar.addEventListener('pointermove', onPointerMove);
    bar.addEventListener('pointerup', onPointerUp);
    bar.addEventListener('pointercancel', onPointerUp);
    bar.addEventListener('touchstart', onTouchStart, { passive: false });
    bar.addEventListener('touchmove', onTouchMove, { passive: false });
    bar.addEventListener('touchend', onTouchEnd);
    bar.addEventListener('touchcancel', onTouchEnd);

    return () => {
      bar.removeEventListener('pointerdown', onPointerDown);
      bar.removeEventListener('pointermove', onPointerMove);
      bar.removeEventListener('pointerup', onPointerUp);
      bar.removeEventListener('pointercancel', onPointerUp);
      bar.removeEventListener('touchstart', onTouchStart);
      bar.removeEventListener('touchmove', onTouchMove);
      bar.removeEventListener('touchend', onTouchEnd);
      bar.removeEventListener('touchcancel', onTouchEnd);
      if (scrubbingRef.current) {
        finishDrag();
      } else {
        removeWindowListeners?.();
      }
    };
  }, [barRef, seekFromClientX]);

  const handleClick = useCallback(
    (clientX: number) => {
      if (suppressClickRef.current) return;
      seekFromClientX(clientX);
    },
    [seekFromClientX],
  );

  return { handleClick };
}
