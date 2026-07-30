/** 下主日服事 P34：名单解析/拼接（与生日相同分隔符，幻灯片用逗号）。 */

import { parseBirthdayNames } from './bulletin-birthday';

export const ROSTER_NAME_MAX = 8;

export function parseRosterNames(raw: string | null | undefined): string[] {
  return parseBirthdayNames(raw).slice(0, ROSTER_NAME_MAX);
}

export function joinRosterNames(names: readonly string[]): string {
  return names
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, ROSTER_NAME_MAX)
    .join('\n');
}

export function joinRosterNamesForSlide(raw: string | null | undefined): string {
  return parseRosterNames(raw).join(', ');
}

export function buildServiceRosterReplacements(bulletin: {
  serviceRosterTodayDate?: string;
  serviceRosterText?: string;
  serviceRosterNextDate?: string;
  serviceRosterChair?: string;
  serviceRosterWorship?: string;
  serviceRosterUsher?: string;
  serviceRosterCleanNames?: string;
}): { textIndex: number; text: string }[] {
  const reps: { textIndex: number; text: string }[] = [];
  const todayDate = bulletin.serviceRosterTodayDate?.trim() ?? '';
  if (todayDate) {
    reps.push({ textIndex: 16, text: `今日(${todayDate})清潔輪值` });
  }
  const todayNames = joinRosterNamesForSlide(bulletin.serviceRosterText);
  if (todayNames) {
    reps.push({ textIndex: 1, text: todayNames });
  }
  const nextDate = bulletin.serviceRosterNextDate?.trim() ?? '';
  if (nextDate) {
    reps.push({ textIndex: 0, text: `下主日(${nextDate})服事輪值` });
  }
  const chair = bulletin.serviceRosterChair?.trim() ?? '';
  if (chair) reps.push({ textIndex: 4, text: `${chair} ` });
  const worship = bulletin.serviceRosterWorship?.trim() ?? '';
  if (worship) reps.push({ textIndex: 8, text: `${worship} ` });
  const usher = bulletin.serviceRosterUsher?.trim() ?? '';
  if (usher) reps.push({ textIndex: 12, text: `${usher} ` });
  const cleanNames = joinRosterNamesForSlide(bulletin.serviceRosterCleanNames);
  if (cleanNames) {
    reps.push({ textIndex: 15, text: cleanNames });
  }
  return reps;
}
