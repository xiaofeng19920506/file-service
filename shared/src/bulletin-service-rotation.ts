/**
 * 季度服事轮值表 → 周报 P34 / P32 字段。
 * 数据源：templates/bulletin/service-rotation/*.json
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** 写入周报草稿的服事轮值相关字段 */
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

/** YYYY-MM-DD → M/D（去前导零） */
export function formatServiceRosterShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  const month = Number.parseInt(m, 10);
  const day = Number.parseInt(d, 10);
  if (!month || !day) return isoDate;
  return `${month}/${day}`;
}

/** 去掉敬拜栏尾缀「姊妹/弟兄/師母」 */
export function normalizeWorshipLeaderName(raw: string): string {
  return raw.replace(/\s*(姊妹|弟兄|師母)\s*$/u, '').trim();
}

/** 清洁名单 → 换行分隔（表单/幻灯片共用） */
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

/**
 * 按主日从轮值表解析 P34/P32 字段。
 * 命中当天行；下一主日取表中下一条（无则下主日字段为空字符串）。
 */
export function resolveServiceRosterFromSchedule(
  serviceDate: string,
  schedules: readonly ServiceRotationSchedule[] = loadBundledServiceRotationSchedules(),
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

function resolveScheduleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '../templates/bulletin/service-rotation');
}

/** 读取仓库内已入库的季度表（Node） */
export function loadBundledServiceRotationSchedules(): ServiceRotationSchedule[] {
  const dir = resolveScheduleDir();
  // 目前仅 2026 Q3；后续季度追加文件即可
  const files = ['2026-q3.json'];
  const out: ServiceRotationSchedule[] = [];
  for (const name of files) {
    try {
      const raw = readFileSync(join(dir, name), 'utf8');
      const parsed = JSON.parse(raw) as ServiceRotationSchedule;
      if (parsed?.quarter && Array.isArray(parsed.weeks)) out.push(parsed);
    } catch {
      // 缺文件时跳过
    }
  }
  return out;
}
