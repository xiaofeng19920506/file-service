import { useCallback, useEffect, useRef, type RefObject } from 'react';

type UseSeekBarDragOptions = {
  barRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onSeekRatio: (ratio: number) => void;
};

/**
 * 进度条点击 / 拖动 seek。Pointer + Touch 双通道，兼容 iOS Safari。
 */
export function useSeekBarDrag({ barRef, enabled, onSeekRatio }: UseSeekBarDragOptions) {
  const enabledRef = useRef(enabled);
  const onSeekRatioRef = useRef(onSeekRatio);
  const suppressClickRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  enabledRef.current = enabled;
  onSeekRatioRef.current = onSeekRatio;

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

    const finishDrag = () => {
      activePointerIdRef.current = null;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 400);
    };

    const onPointerDown = (e: PointerEvent) => {
      // 触摸由 touch 事件处理，避免 iOS 上 pointer + touch 重复触发
      if (e.pointerType === 'touch') return;
      if (!enabledRef.current || e.button !== 0) return;
      if (activePointerIdRef.current !== null) return;
      activePointerIdRef.current = e.pointerId;
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      seekFromClientX(e.clientX);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      seekFromClientX(e.clientX);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (activePointerIdRef.current !== e.pointerId) return;
      if (bar.hasPointerCapture(e.pointerId)) {
        bar.releasePointerCapture(e.pointerId);
      }
      finishDrag();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      seekFromClientX(e.touches[0]!.clientX);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      seekFromClientX(e.touches[0]!.clientX);
    };

    const onTouchEnd = () => {
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
