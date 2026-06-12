import { useEffect, useRef, type RefObject } from 'react';

type UseSwipeTrackNavigationOptions = {
  targetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  canGoNext?: boolean;
  canGoPrev?: boolean;
  thresholdPx?: number;
  maxDurationMs?: number;
};

/**
 * 手机端滑动切歌：右滑 / 下滑 → 下一首，左滑 / 上滑 → 上一首。
 */
export function useSwipeTrackNavigation({
  targetRef,
  enabled,
  onNext,
  onPrev,
  canGoNext = true,
  canGoPrev = true,
  thresholdPx = 48,
  maxDurationMs = 450,
}: UseSwipeTrackNavigationOptions) {
  const onNextRef = useRef(onNext);
  const onPrevRef = useRef(onPrev);
  const canGoNextRef = useRef(canGoNext);
  const canGoPrevRef = useRef(canGoPrev);

  onNextRef.current = onNext;
  onPrevRef.current = onPrev;
  canGoNextRef.current = canGoNext;
  canGoPrevRef.current = canGoPrev;

  useEffect(() => {
    const el = targetRef.current;
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      tracking = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Date.now() - startTime > maxDurationMs) return;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < thresholdPx) return;

      if (absDx >= absDy) {
        if (dx >= thresholdPx && canGoNextRef.current) onNextRef.current?.();
        else if (dx <= -thresholdPx && canGoPrevRef.current) onPrevRef.current?.();
      } else {
        if (dy >= thresholdPx && canGoNextRef.current) onNextRef.current?.();
        else if (dy <= -thresholdPx && canGoPrevRef.current) onPrevRef.current?.();
      }
    };

    const onTouchCancel = () => {
      tracking = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [enabled, maxDurationMs, targetRef, thresholdPx]);
}
