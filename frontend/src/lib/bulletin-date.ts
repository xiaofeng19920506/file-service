/** PPT 封面日期格式：06/14/2026 */
export function formatBulletinCoverDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${m}/${d}/${y}`;
}

/** PPT 短日期：6/14（去前导零，贴近模板） */
export function formatBulletinShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  const month = Number.parseInt(m, 10);
  const day = Number.parseInt(d, 10);
  if (!month || !day) return isoDate;
  return `${month}/${day}`;
}

/** 本地日历日 → YYYY-MM-DD（避免 toISOString 的 UTC 偏移） */
export function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(from = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate());
}

/**
 * 即将到来的主日：当天是周日则用今天，否则用本周/下周最近的周日。
 * 用于打开周报时自动选中封面日期。
 */
export function upcomingSundayIso(from = new Date()): string {
  const d = startOfLocalDay(from);
  const day = d.getDay();
  if (day !== 0) d.setDate(d.getDate() + (7 - day));
  return toLocalIsoDate(d);
}

/**
 * 严格意义上的「下一个」周日：若当天已是周日，则跳到再下一周。
 * 保留给需要显式「再下一周」的场景。
 */
export function nextSundayIso(from = new Date()): string {
  const d = startOfLocalDay(from);
  const day = d.getDay();
  const add = day === 0 ? 7 : 7 - day;
  d.setDate(d.getDate() + add);
  return toLocalIsoDate(d);
}

export function sundayAfterIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map((part) => Number.parseInt(part, 10));
  if (!y || !m || !d) return isoDate;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 7);
  return toLocalIsoDate(date);
}

/** 从即将到来的主日起，找到第一个尚未占用的周日 */
export function resolveAvailableSundayIso(
  occupiedDates: Iterable<string>,
  from = new Date(),
): string {
  const taken = new Set(occupiedDates);
  let date = upcomingSundayIso(from);
  // 占用集合有限，必能找到空闲主日；勿在未检查的情况下 return 推进后的 date
  while (taken.has(date)) {
    date = sundayAfterIso(date);
  }
  return date;
}

export function isoDateFromInput(value: string): string {
  return value.trim();
}
