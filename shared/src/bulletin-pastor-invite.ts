/** 周报主日信息：牧师邮箱定时邀请相关工具 */

export function isValidPastorEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** 在指定时区取 weekday(0=Sun…6=Sat) 与 hour(0–23) */
export function zonedWeekdayAndHour(
  now: Date,
  timeZone: string,
): { weekday: number; hour: number; isoDate: string } {
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(now);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayName] ?? -1;

  const hourRaw = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(hourRaw.find((p) => p.type === 'hour')?.value ?? '-1');

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = dateParts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = dateParts.find((p) => p.type === 'month')?.value ?? '01';
  const d = dateParts.find((p) => p.type === 'day')?.value ?? '01';
  return { weekday, hour, isoDate: `${y}-${m}-${d}` };
}

/** 给定时区「今天」对应的即将到来的主日 YYYY-MM-DD */
export function upcomingSundayIsoInTimeZone(now: Date, timeZone: string): string {
  const { weekday, isoDate } = zonedWeekdayAndHour(now, timeZone);
  const [ys, ms, ds] = isoDate.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(ys!, ms! - 1, ds!, 12, 0, 0));
  const add = weekday === 0 ? 0 : 7 - weekday;
  utcNoon.setUTCDate(utcNoon.getUTCDate() + add);
  const y = utcNoon.getUTCFullYear();
  const m = String(utcNoon.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcNoon.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 周一且已到发送时刻（默认 ≥9 点） */
export function isMondayPastorInviteWindow(
  now: Date,
  opts?: { timeZone?: string; hour?: number },
): boolean {
  const timeZone = opts?.timeZone ?? 'America/New_York';
  const minHour = opts?.hour ?? 9;
  const { weekday, hour } = zonedWeekdayAndHour(now, timeZone);
  return weekday === 1 && hour >= minHour && hour < 24;
}
