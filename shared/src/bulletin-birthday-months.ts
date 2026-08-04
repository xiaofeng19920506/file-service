/**
 * 生日十二个月：主模板只留一个锚点页；各月完整幻灯片存在模板库目录。
 * 预览/导出时按 birthdayMonth 取出当月页 splice 到锚点。
 */

export const BIRTHDAY_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type BirthdayMonth = (typeof BIRTHDAY_MONTHS)[number];

/** 主模板内生日锚点（旧单月页）；库中当月页会覆写此文件号 */
export const BIRTHDAY_ANCHOR_SLIDE = 24;

/**
 * 历史：曾把 1–12 月页扩进主模板为 slide39–50。
 * 抽出到独立库后主模板不再含这些页；此映射仅用于迁移脚本。
 */
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

/** 分区表 / deck：生日只有锚点一页 */
export const BIRTHDAY_MONTH_SLIDES: readonly number[] = [BIRTHDAY_ANCHOR_SLIDE];

/** 旧 P23 提醒页：始终从 deck 删除 */
export const BIRTHDAY_LEGACY_SLIDE_FILES = [23] as const;

export type BirthdayNamesByMonth = Partial<Record<string, string>>;

export function isBirthdayMonth(value: unknown): value is BirthdayMonth {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12;
}

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

/** @deprecated 主模板不再按月占页；请用 BIRTHDAY_ANCHOR_SLIDE */
export function slideNumberForBirthdayMonth(_month: BirthdayMonth): number {
  return BIRTHDAY_ANCHOR_SLIDE;
}

export function birthdayMonthLibraryFileName(month: BirthdayMonth): string {
  return `month-${String(month).padStart(2, '0')}.pptx`;
}

/** section_pptx_overrides 中按月覆盖的 key，如 birthday_7 */
export function birthdayMonthOverrideKey(month: BirthdayMonth): string {
  return `birthday_${month}`;
}

export function parseBirthdayMonthOverrideKey(key: string): BirthdayMonth | null {
  const m = /^birthday_([1-9]|1[0-2])$/.exec(key.trim());
  if (!m) return null;
  return Number(m[1]) as BirthdayMonth;
}

/**
 * 从 section_pptx_overrides 解析当月覆盖 blobId。
 * 优先 birthday_N；兼容旧的 birthday 键。
 */
export function resolveBirthdayMonthOverrideBlobId(
  overrides: Record<string, string> | null | undefined,
  month: BirthdayMonth,
): string | null {
  if (!overrides) return null;
  const keyed = overrides[birthdayMonthOverrideKey(month)]?.trim();
  if (keyed) return keyed;
  const legacy = overrides.birthday?.trim();
  return legacy || null;
}

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
  if (text.startsWith('{')) {
    try {
      return parseBirthdayNamesByMonth(JSON.parse(text) as unknown);
    } catch {
      /* fall through */
    }
  }
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
