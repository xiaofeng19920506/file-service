/**
 * 生日十二个月：月份编号 ↔ 模板 slide 文件号；名单按月 JSON。
 * 占位页目前为 slide39–50（由 scripts/expand-birthday-month-slides.ts 从 P24 复制）。
 * 正式模板到位后只改 BIRTHDAY_MONTH_SLIDE_MAP。
 */

export const BIRTHDAY_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type BirthdayMonth = (typeof BIRTHDAY_MONTHS)[number];

/** 月 → 模板 ppt/slides/slideN.xml 的 N */
export const BIRTHDAY_MONTH_SLIDE_MAP: Record<BirthdayMonth, number> = {
  1: 39,
  2: 40,
  3: 41,
  4: 42,
  5: 43,
  6: 44,
  7: 45,
  8: 46,
  9: 47,
  10: 48,
  11: 49,
  12: 50,
};

export const BIRTHDAY_MONTH_SLIDES: readonly number[] = BIRTHDAY_MONTHS.map(
  (m) => BIRTHDAY_MONTH_SLIDE_MAP[m],
);

/** 旧 P23 提醒 + 旧 P24 单月页：始终从 deck 删除，改用 39–50 */
export const BIRTHDAY_LEGACY_SLIDE_FILES = [23, 24] as const;

export type BirthdayNamesByMonth = Partial<Record<string, string>>;

export function isBirthdayMonth(value: unknown): value is BirthdayMonth {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12;
}

/** 将任意存库/表单值规范为 1–12；失败则用 fallback（默认当前月） */
export function normalizeBirthdayMonth(
  raw: unknown,
  fallback: BirthdayMonth = (new Date().getMonth() + 1) as BirthdayMonth,
): BirthdayMonth {
  if (typeof raw === 'number' && isBirthdayMonth(raw)) return raw;
  const text = String(raw ?? '').trim();
  if (!text) return fallback;
  if (/^\d{1,2}$/.test(text)) {
    const n = Number(text);
    if (isBirthdayMonth(n)) return n;
  }
  // 旧文案：「7月份生日的家人們」「7月」
  const m = text.match(/(\d{1,2})\s*月/);
  if (m) {
    const n = Number(m[1]);
    if (isBirthdayMonth(n)) return n;
  }
  return fallback;
}

export function birthdayMonthFromServiceDate(serviceDate: string | null | undefined): BirthdayMonth {
  const iso = String(serviceDate ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) {
    const month = Number(m[2]);
    if (isBirthdayMonth(month)) return month;
  }
  return (new Date().getMonth() + 1) as BirthdayMonth;
}

export function slideNumberForBirthdayMonth(month: BirthdayMonth): number {
  return BIRTHDAY_MONTH_SLIDE_MAP[month];
}

/** 解析存库 birthday_names：JSON 按月，或旧扁平字符串 */
export function parseBirthdayNamesByMonth(raw: unknown): BirthdayNamesByMonth {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: BirthdayNamesByMonth = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!isBirthdayMonth(Number(k))) continue;
      if (typeof v === 'string') out[String(Number(k))] = v;
    }
    return out;
  }
  const text = String(raw).trim();
  if (!text) return {};
  // 尝试 JSON
  if (text.startsWith('{')) {
    try {
      return parseBirthdayNamesByMonth(JSON.parse(text) as unknown);
    } catch {
      /* fall through：当扁平名单 */
    }
  }
  // 旧扁平名单：调用方应再 merge 到当前月
  return { __flat__: text };
}

export function serializeBirthdayNamesByMonth(map: BirthdayNamesByMonth): string {
  const out: Record<string, string> = {};
  for (const month of BIRTHDAY_MONTHS) {
    const key = String(month);
    const val = (map[key] ?? '').trim();
    if (val) out[key] = val;
  }
  return JSON.stringify(out);
}

/**
 * 兼容读取：返回规范月份 + 按月名单。
 * 若存的是旧扁平名单，挂到 resolvedMonth 上。
 */
export function resolveBirthdayFields(input: {
  birthdayMonth?: string | null;
  birthdayNames?: string | null;
  serviceDate?: string | null;
}): { month: BirthdayMonth; namesByMonth: BirthdayNamesByMonth; namesForMonth: string } {
  const fallback = birthdayMonthFromServiceDate(input.serviceDate);
  const month = normalizeBirthdayMonth(input.birthdayMonth, fallback);
  const parsed = parseBirthdayNamesByMonth(input.birthdayNames);
  const namesByMonth: BirthdayNamesByMonth = { ...parsed };
  if (typeof namesByMonth.__flat__ === 'string') {
    const flat = namesByMonth.__flat__;
    delete namesByMonth.__flat__;
    const key = String(month);
    if (!namesByMonth[key]?.trim()) namesByMonth[key] = flat;
  }
  return {
    month,
    namesByMonth,
    namesForMonth: (namesByMonth[String(month)] ?? '').trim(),
  };
}

export function setBirthdayNamesForMonth(
  map: BirthdayNamesByMonth,
  month: BirthdayMonth,
  names: string,
): BirthdayNamesByMonth {
  const next = { ...map };
  const key = String(month);
  const trimmed = names.trim();
  if (trimmed) next[key] = trimmed;
  else delete next[key];
  delete next.__flat__;
  return next;
}
