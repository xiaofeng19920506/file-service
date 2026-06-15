import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

type ItemLayout = { top: number; height: number };

type SortableDrag = {
  from: number;
  startY: number;
  deltaY: number;
  gapIndex: number;
  stride: number;
  layouts: ItemLayout[];
  pointerId: number;
};

function gapIndexFromY(y: number, layouts: ItemLayout[]): number {
  for (let i = 0; i < layouts.length; i++) {
    const mid = layouts[i]!.top + layouts[i]!.height / 2;
    if (y < mid) return i;
  }
  return layouts.length;
}

function finalIndexFromGap(from: number, gapIndex: number): number | null {
  if (gapIndex === from || gapIndex === from + 1) return null;
  return gapIndex > from ? gapIndex - 1 : gapIndex;
}

type UseSortableVerticalListOptions = {
  enabled: boolean;
  listRef: RefObject<HTMLOListElement | null>;
  onCommit: (from: number, toIndex: number) => void;
};

export function useSortableVerticalList({
  enabled,
  listRef,
  onCommit,
}: UseSortableVerticalListOptions) {
  const [drag, setDrag] = useState<SortableDrag | null>(null);
  const dragRef = useRef<SortableDrag | null>(null);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  const finishDrag = useCallback(
    (pointerId: number) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== pointerId) return;

      const toIndex = finalIndexFromGap(current.from, current.gapIndex);
      if (toIndex !== null) {
        onCommit(current.from, toIndex);
      }
      dragRef.current = null;
      setDrag(null);
    },
    [onCommit],
  );

  useEffect(() => {
    if (!drag) return;

    const onPointerMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;

      const deltaY = event.clientY - current.startY;
      const gapIndex = gapIndexFromY(event.clientY, current.layouts);
      setDrag({ ...current, deltaY, gapIndex });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      finishDrag(event.pointerId);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [drag, finishDrag]);

  const bindDragHandle = useCallback(
    (index: number) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (!enabled || event.button !== 0 || !listRef.current) return;

        const listEl = listRef.current;
        const children = Array.from(listEl.children) as HTMLElement[];
        const layouts = children.map((child) => {
          const rect = child.getBoundingClientRect();
          return { top: rect.top, height: rect.height };
        });
        if (!layouts[index]) return;

        const stride =
          layouts.length > 1
            ? layouts[1]!.top - layouts[0]!.top
            : layouts[0]!.height + 4;

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        const nextDrag: SortableDrag = {
          from: index,
          startY: event.clientY,
          deltaY: 0,
          gapIndex: index,
          stride,
          layouts,
          pointerId: event.pointerId,
        };
        dragRef.current = nextDrag;
        setDrag(nextDrag);
      },
    }),
    [enabled, listRef],
  );

  const getItemStyle = useCallback(
    (index: number): CSSProperties => {
      if (!drag) return {};

      if (index === drag.from) {
        return {
          transform: `translateY(${drag.deltaY}px)`,
          zIndex: 2,
          position: 'relative',
        };
      }

      const { from, gapIndex, stride } = drag;
      if (from < gapIndex && index > from && index < gapIndex) {
        return { transform: `translateY(${-stride}px)` };
      }
      if (from > gapIndex && index >= gapIndex && index < from) {
        return { transform: `translateY(${stride}px)` };
      }
      return {};
    },
    [drag],
  );

  const isDraggingItem = useCallback((index: number) => drag?.from === index, [drag]);

  return {
    isSorting: drag !== null,
    bindDragHandle,
    getItemStyle,
    isDraggingItem,
  };
}
