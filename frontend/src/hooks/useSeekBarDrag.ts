import { useCallback, useEffect, useRef, type RefObject } from 'react';

type UseSeekBarDragOptions = {
  barRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onSeekRatio: (ratio: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
};

const TOUCH_DRAG_THRESHOLD_PX = 4;

/**
 * 进度条点击 / 拖动 seek。Pointer + Touch 双通道（iOS 上 touch 比 pointer 更可靠）。
 * 触摸轻点只 seek、不进入拖拽态；手指移动超过阈值后才进入拖拽。
 * pointer/touch 结束（含 window capture、cancel、unmount）一定会 onScrubEnd，避免进度条冻住。
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
  const touchStartXRef = useRef(0);
  const touchMovedRef = useRef(false);
  const pointerStartXRef = useRef(0);
  const pointerMovedRef = useRef(false);
  const scrubbingRef = useRef(false);
  const finishDragRef = useRef<() => void>(() => {});

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

    let scrubFailsafeTimer: number | null = null;

    const clearScrubFailsafe = () => {
      if (scrubFailsafeTimer !== null) {
        window.clearTimeout(scrubFailsafeTimer);
        scrubFailsafeTimer = null;
      }
    };

    const releasePointerCapture = (pointerId: number) => {
      try {
        if (bar.hasPointerCapture(pointerId)) {
          bar.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }
    };

    const finishDrag = () => {
      clearScrubFailsafe();

      const pointerId = activePointerIdRef.current;
      activePointerIdRef.current = null;
      touchDragRef.current = false;
      touchMovedRef.current = false;
      pointerMovedRef.current = false;

      if (pointerId !== null) {
        releasePointerCapture(pointerId);
      }

      // 只要进过拖拽锁，结束时必须解锁；即使内部 scrubbingRef 已乱，也再发一次 onScrubEnd
      const wasScrubbing = scrubbingRef.current;
      scrubbingRef.current = false;
      if (wasScrubbing) {
        onScrubEndRef.current?.();
      }

      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 400);
    };

    finishDragRef.current = finishDrag;

    const beginDrag = () => {
      if (!scrubbingRef.current) {
        scrubbingRef.current = true;
        onScrubStartRef.current?.();
      }
      clearScrubFailsafe();
      scrubFailsafeTimer = window.setTimeout(() => {
        if (scrubbingRef.current) finishDrag();
      }, 8000);
    };

    const finishTouch = (e?: TouchEvent) => {
      if (!touchDragRef.current && !scrubbingRef.current) return;

      if (!scrubbingRef.current) {
        const touch = e?.changedTouches?.[0];
        if (touch) seekFromClientX(touch.clientX);
        touchDragRef.current = false;
        touchMovedRef.current = false;
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 400);
        return;
      }

      finishDrag();
    };

    const finishPointerTap = (clientX: number, pointerId: number) => {
      releasePointerCapture(pointerId);
      activePointerIdRef.current = null;
      pointerMovedRef.current = false;
      seekFromClientX(clientX);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 400);
    };

    const hasActiveGesture = () =>
      activePointerIdRef.current !== null || touchDragRef.current || scrubbingRef.current;

    const onWindowPointerEnd = (e: PointerEvent) => {
      if (!hasActiveGesture()) return;
      if (touchDragRef.current) return;
      if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
        return;
      }
      if (!scrubbingRef.current) {
        if (activePointerIdRef.current === e.pointerId) {
          finishPointerTap(e.clientX, e.pointerId);
        }
        return;
      }
      finishDrag();
    };

    const onWindowTouchEnd = (e: TouchEvent) => {
      if (!touchDragRef.current && !scrubbingRef.current) return;
      finishTouch(e);
    };

    const onLostPointerCapture = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      if (scrubbingRef.current) {
        finishDrag();
        return;
      }
      activePointerIdRef.current = null;
      pointerMovedRef.current = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || touchDragRef.current) return;
      if (!enabledRef.current || e.button !== 0) return;
      if (activePointerIdRef.current !== null) return;

      activePointerIdRef.current = e.pointerId;
      pointerMovedRef.current = false;
      pointerStartXRef.current = e.clientX;
      e.preventDefault();

      try {
        bar.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || touchDragRef.current) return;
      if (activePointerIdRef.current !== e.pointerId) return;
      const moved =
        Math.abs(e.clientX - pointerStartXRef.current) >= TOUCH_DRAG_THRESHOLD_PX;
      if (!moved && !scrubbingRef.current) return;

      e.preventDefault();
      pointerMovedRef.current = true;
      if (!scrubbingRef.current) beginDrag();
      seekFromClientX(e.clientX);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || touchDragRef.current) return;
      if (activePointerIdRef.current !== e.pointerId && !scrubbingRef.current) return;
      if (!scrubbingRef.current) {
        if (activePointerIdRef.current === e.pointerId) {
          finishPointerTap(e.clientX, e.pointerId);
        }
        return;
      }
      if (activePointerIdRef.current === e.pointerId) {
        releasePointerCapture(e.pointerId);
      }
      finishDrag();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      touchDragRef.current = true;
      touchMovedRef.current = false;
      touchStartXRef.current = e.touches[0]!.clientX;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchDragRef.current || !enabledRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      const moved = Math.abs(touch.clientX - touchStartXRef.current) >= TOUCH_DRAG_THRESHOLD_PX;
      if (!moved && !scrubbingRef.current) return;

      e.preventDefault();
      touchMovedRef.current = true;
      if (!scrubbingRef.current) beginDrag();
      seekFromClientX(touch.clientX);
    };

    const onTouchEnd = (e: TouchEvent) => {
      finishTouch(e);
    };

    const onVisibilityOrBlur = () => {
      if (hasActiveGesture()) finishDrag();
    };

    bar.addEventListener('pointerdown', onPointerDown);
    bar.addEventListener('pointermove', onPointerMove);
    bar.addEventListener('pointerup', onPointerUp);
    bar.addEventListener('pointercancel', onPointerUp);
    bar.addEventListener('lostpointercapture', onLostPointerCapture);
    bar.addEventListener('touchstart', onTouchStart, { passive: false });
    bar.addEventListener('touchmove', onTouchMove, { passive: false });
    bar.addEventListener('touchend', onTouchEnd);
    bar.addEventListener('touchcancel', onTouchEnd);

    // capture 挂在 window，避免 iOS 上元素收不到 pointerup/touchend 导致永久卡在 scrub
    window.addEventListener('pointerup', onWindowPointerEnd, true);
    window.addEventListener('pointercancel', onWindowPointerEnd, true);
    window.addEventListener('touchend', onWindowTouchEnd, { capture: true, passive: false });
    window.addEventListener('touchcancel', onWindowTouchEnd, { capture: true, passive: false });
    window.addEventListener('blur', onVisibilityOrBlur);
    document.addEventListener('visibilitychange', onVisibilityOrBlur);

    return () => {
      bar.removeEventListener('pointerdown', onPointerDown);
      bar.removeEventListener('pointermove', onPointerMove);
      bar.removeEventListener('pointerup', onPointerUp);
      bar.removeEventListener('pointercancel', onPointerUp);
      bar.removeEventListener('lostpointercapture', onLostPointerCapture);
      bar.removeEventListener('touchstart', onTouchStart);
      bar.removeEventListener('touchmove', onTouchMove);
      bar.removeEventListener('touchend', onTouchEnd);
      bar.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointerup', onWindowPointerEnd, true);
      window.removeEventListener('pointercancel', onWindowPointerEnd, true);
      window.removeEventListener('touchend', onWindowTouchEnd, true);
      window.removeEventListener('touchcancel', onWindowTouchEnd, true);
      window.removeEventListener('blur', onVisibilityOrBlur);
      document.removeEventListener('visibilitychange', onVisibilityOrBlur);
      if (hasActiveGesture()) {
        finishDrag();
      } else {
        clearScrubFailsafe();
      }
    };
  }, [barRef, seekFromClientX]);

  useEffect(() => {
    if (enabled) return;
    finishDragRef.current();
  }, [enabled]);

  const handleClick = useCallback(
    (clientX: number) => {
      if (suppressClickRef.current) return;
      seekFromClientX(clientX);
    },
    [seekFromClientX],
  );

  return { handleClick };
}
