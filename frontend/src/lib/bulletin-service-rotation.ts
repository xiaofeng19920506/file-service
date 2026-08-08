/**
 * 季度服事轮值表（前端）：与 shared/bulletin-service-rotation 同逻辑，
 * 避免从 @file-service/shared 整包引入 Node 依赖。
 *
 * 优先使用 API 拉取的 schedule；失败时回退 bundled JSON。
 */

import schedule2026q3 from '../../../shared/templates/bulletin/service-rotation/2026-q3.json';

export type ServiceRotationWeek = {
  date: string;
  chair: string;
  usher: string;
  worship: string;
  cleaning: string;
  scripture?: string;
  communionOrTestimony?: string;
  sound?: string;
};

export type ServiceRotationSchedule = {
  source?: string;
  quarter: {
    year: number;
    startMonth: number;
    endMonth: number;
  };
  weeks: ServiceRotationWeek[];
};

export type ServiceRosterFromSchedule = {
  serviceRosterTodayDate: string;
  serviceRosterText: string;
  serviceRosterNextDate: string;
  serviceRosterChair: string;
  serviceRosterWorship: string;
  serviceRosterUsher: string;
  serviceRosterCleanNames: string;
  rotationStartMonth: string;
  rotationEndMonth: string;
};

const BUNDLED_SCHEDULES: ServiceRotationSchedule[] = [
  schedule2026q3 as ServiceRotationSchedule,
];

let runtimeSchedules: ServiceRotationSchedule[] | null = null;

/** 由页面在加载时注入 API 返回的 schedule */
export function setServiceRotationSchedules(
  schedules: ServiceRotationSchedule[] | null,
): void {
  runtimeSchedules =
    schedules && schedules.length > 0 ? schedules : null;
}

export function getServiceRotationSchedules(): ServiceRotationSchedule[] {
  return runtimeSchedules ?? BUNDLED_SCHEDULES;
}

export function formatServiceRosterShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  const month = Number.parseInt(m, 10);
  const day = Number.parseInt(d, 10);
  if (!month || !day) return isoDate;
  return `${month}/${day}`;
}

export function normalizeWorshipLeaderName(raw: string): string {
  return raw.replace(/\s*(姊妹|弟兄|師母)\s*$/u, '').trim();
}

export function cleaningToRosterLines(raw: string): string {
  return raw
    .split(/[,，;；]/u)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
}

function findScheduleForDate(
  serviceDate: string,
  schedules: readonly ServiceRotationSchedule[],
): { schedule: ServiceRotationSchedule; index: number } | null {
  const date = serviceDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  for (const schedule of schedules) {
    const index = schedule.weeks.findIndex((w) => w.date === date);
    if (index >= 0) return { schedule, index };
  }
  return null;
}

export function resolveServiceRosterFromSchedule(
  serviceDate: string,
  schedules: readonly ServiceRotationSchedule[] = getServiceRotationSchedules(),
): ServiceRosterFromSchedule | null {
  const hit = findScheduleForDate(serviceDate, schedules);
  if (!hit) return null;

  const { schedule, index } = hit;
  const today = schedule.weeks[index]!;
  const next = schedule.weeks[index + 1];

  return {
    serviceRosterTodayDate: formatServiceRosterShortDate(today.date),
    serviceRosterText: cleaningToRosterLines(today.cleaning),
    serviceRosterNextDate: next ? formatServiceRosterShortDate(next.date) : '',
    serviceRosterChair: next?.chair.trim() ?? '',
    serviceRosterWorship: next ? normalizeWorshipLeaderName(next.worship) : '',
    serviceRosterUsher: next?.usher.trim() ?? '',
    serviceRosterCleanNames: next ? cleaningToRosterLines(next.cleaning) : '',
    rotationStartMonth: String(schedule.quarter.startMonth),
    rotationEndMonth: String(schedule.quarter.endMonth),
  };
}

export function applyServiceRosterFromSchedule<T extends { serviceDate?: string }>(
  bulletin: T,
): T {
  const fields = resolveServiceRosterFromSchedule(bulletin.serviceDate ?? '');
  if (!fields) return bulletin;
  return { ...bulletin, ...fields };
}
