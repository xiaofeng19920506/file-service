const STORAGE_KEY = 'playlist-shuffle-enabled';

/** Fisher–Yates shuffle of [0..length-1] */
export function buildShuffleOrder(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export type ShuffleRepeatMode = 'off' | 'all' | 'one';

/** 以当前曲目在随机序中的位置为准，避免 cursor 状态漂移 */
export function resolveShuffleCursor(
  order: number[],
  activeIndex: number,
  fallbackCursor = 0,
): number {
  const cursor = order.indexOf(activeIndex);
  return cursor >= 0 ? cursor : fallbackCursor;
}

export type ShuffleAdvanceResult =
  | { kind: 'track'; index: number; cursor: number }
  | { kind: 'reshuffle'; order: number[]; index: number; cursor: number }
  | { kind: 'stop' };

export function advanceShufflePlayback(
  order: number[],
  activeIndex: number,
  fallbackCursor: number,
  itemCount: number,
  repeatMode: ShuffleRepeatMode,
  nextOrderFactory: () => number[] = () => buildShuffleOrder(itemCount),
): ShuffleAdvanceResult {
  const currentCursor = resolveShuffleCursor(order, activeIndex, fallbackCursor);
  const nextCursor = currentCursor + 1;

  if (nextCursor < itemCount) {
    return { kind: 'track', index: order[nextCursor]!, cursor: nextCursor };
  }

  if (repeatMode === 'all') {
    const nextOrder = nextOrderFactory();
    return { kind: 'reshuffle', order: nextOrder, index: nextOrder[0]!, cursor: 0 };
  }

  return { kind: 'stop' };
}

export function retreatShufflePlayback(
  order: number[],
  activeIndex: number,
  fallbackCursor: number,
): { index: number; cursor: number } | null {
  const currentCursor = resolveShuffleCursor(order, activeIndex, fallbackCursor);
  if (currentCursor <= 0) return null;
  const prevCursor = currentCursor - 1;
  return { index: order[prevCursor]!, cursor: prevCursor };
}

export function canAdvanceShuffle(
  order: number[],
  activeIndex: number,
  fallbackCursor: number,
  itemCount: number,
  repeatMode: ShuffleRepeatMode,
): boolean {
  if (itemCount <= 0) return false;
  const currentCursor = resolveShuffleCursor(order, activeIndex, fallbackCursor);
  return currentCursor < itemCount - 1 || repeatMode === 'all';
}

export function canRetreatShuffle(
  order: number[],
  activeIndex: number,
  fallbackCursor: number,
): boolean {
  return resolveShuffleCursor(order, activeIndex, fallbackCursor) > 0;
}

export function readPlaylistShuffleEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePlaylistShuffleEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}
