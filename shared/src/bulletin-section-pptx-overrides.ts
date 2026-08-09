import { BULLETIN_SECTION_TEMPLATE_SLIDES } from './bulletin-section-visibility.js';
import type { BulletinFormFieldReapplyOptions } from './bulletin-pptx-patch.js';
import {
  birthdayMonthOverrideKey,
  parseBirthdayMonthOverrideKey,
  type BirthdayMonth,
} from './bulletin-birthday-months.js';

/** sectionId → blobId；另支持 birthday_1…birthday_12 按月覆盖 */
export type SectionPptxOverrides = Record<string, string>;

/**
 * 这些分区上传 PPT 时：保留模板原页，把上传页插在锚点末页之后（非整段替换）。
 * 每次预览/导出都从原版模板重新 splice：更换 override blob 只会替换「追加段」，
 * 不会叠加上周页数，也不会盖掉模板主日信息页。
 * 目前仅主日信息。
 */
export const BULLETIN_SECTION_PPTX_APPEND_AFTER = new Set(['message']);

export function sectionPptxOverrideAppendsAfter(sectionId: string): boolean {
  return BULLETIN_SECTION_PPTX_APPEND_AFTER.has(sectionId);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAllowedOverrideKey(key: string): boolean {
  if (BULLETIN_SECTION_TEMPLATE_SLIDES[key]) return true;
  return parseBirthdayMonthOverrideKey(key) != null;
}

export function normalizeSectionPptxOverrides(raw: unknown): SectionPptxOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: SectionPptxOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const sectionId = key.trim();
    if (!sectionId || !isAllowedOverrideKey(sectionId)) continue;
    if (typeof value !== 'string') continue;
    const blobId = value.trim();
    if (!blobId || !UUID_RE.test(blobId)) continue;
    out[sectionId] = blobId;
  }
  return out;
}

export function setSectionPptxOverride(
  existing: SectionPptxOverrides | null | undefined,
  sectionId: string,
  blobId: string | null,
): SectionPptxOverrides {
  const next = { ...normalizeSectionPptxOverrides(existing) };
  if (!isAllowedOverrideKey(sectionId)) return next;
  if (!blobId) {
    delete next[sectionId];
    return next;
  }
  if (!UUID_RE.test(blobId)) return next;
  next[sectionId] = blobId;
  return next;
}

/** 保存生日分区时写入 birthday_N（并可同步旧 birthday 键） */
export function setBirthdayMonthPptxOverride(
  existing: SectionPptxOverrides | null | undefined,
  month: BirthdayMonth,
  blobId: string | null,
): SectionPptxOverrides {
  let next = setSectionPptxOverride(existing, birthdayMonthOverrideKey(month), blobId);
  // 兼容旧 UI：birthday 指向当前月覆盖
  next = setSectionPptxOverride(next, 'birthday', blobId);
  return next;
}

export function clearBirthdayMonthPptxOverride(
  existing: SectionPptxOverrides | null | undefined,
  month: BirthdayMonth,
): SectionPptxOverrides {
  return setBirthdayMonthPptxOverride(existing, month, null);
}

  /** 已整段替换的分区：splice 后不要再回写该区「自由文字覆盖」；
 * 封面/会前/生日/金句仍由表单驱动，必须回写，否则中间改了右侧预览不变。
 * 追加模式（主日信息）仍保留模板锚点页，不跳过其表单回写。 */
export function formFieldReapplyOptionsForSectionOverrides(
  overrides: SectionPptxOverrides | null | undefined,
): BulletinFormFieldReapplyOptions {
  const normalized = normalizeSectionPptxOverrides(overrides);
  const ids = new Set(
    Object.keys(normalized).filter((k) => Boolean(BULLETIN_SECTION_TEMPLATE_SLIDES[k])),
  );
  const formDriven = new Set(['cover', 'pre_service', 'birthday', 'verse_of_week', 'offering']);
  const skipSlideNumbers = new Set<number>();
  for (const sectionId of ids) {
    if (formDriven.has(sectionId)) continue;
    if (sectionPptxOverrideAppendsAfter(sectionId)) continue;
    for (const slide of BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId] ?? []) {
      skipSlideNumbers.add(slide);
    }
  }
  return {
    skipCover: false,
    skipPreService: false,
    skipBirthday: false,
    skipVerseOfWeek: false,
    skipSlideNumbers,
  };
}
