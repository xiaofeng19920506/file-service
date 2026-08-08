/**
 * 投影翻页：跳过隐藏分区页，页码与预览 deck 一致。
 */

export function normalizeSkipSlides(
  skipSlides: readonly number[] | null | undefined,
): Set<number> {
  const set = new Set<number>();
  for (const n of skipSlides ?? []) {
    if (Number.isFinite(n) && n >= 1) set.add(Math.floor(n));
  }
  return set;
}

/** 从 current 沿 dir 找到下一张不在 skip 中的页；没有则返回 current */
export function stepPresentableSlide(
  current: number,
  dir: 1 | -1,
  totalSlides: number,
  skip: ReadonlySet<number>,
): number {
  let next = current + dir;
  while (next >= 1 && next <= totalSlides && skip.has(next)) {
    next += dir;
  }
  if (next < 1 || next > totalSlides) return current;
  return next;
}

/** 若 start 被跳过，挪到最近可放映页（优先向后） */
export function coercePresentableSlide(
  start: number,
  totalSlides: number,
  skip: ReadonlySet<number>,
): number {
  const clamped = Math.min(totalSlides, Math.max(1, start));
  if (!skip.has(clamped)) return clamped;
  const forward = stepPresentableSlide(clamped, 1, totalSlides, skip);
  if (forward !== clamped) return forward;
  const backward = stepPresentableSlide(clamped, -1, totalSlides, skip);
  if (backward !== clamped) return backward;
  // 全部被跳过时仍停在合法页码
  return clamped;
}

export function firstPresentableSlide(
  totalSlides: number,
  skip: ReadonlySet<number>,
): number {
  return coercePresentableSlide(1, totalSlides, skip);
}

export function lastPresentableSlide(
  totalSlides: number,
  skip: ReadonlySet<number>,
): number {
  return coercePresentableSlide(totalSlides, totalSlides, skip);
}
