import { BULLETIN_SECTION_TEMPLATE_SLIDES } from './bulletin-section-visibility.js';
import type { BulletinFormFieldReapplyOptions } from './bulletin-pptx-patch.js';

/** sectionId → blobId */
export type SectionPptxOverrides = Record<string, string>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeSectionPptxOverrides(raw: unknown): SectionPptxOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: SectionPptxOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const sectionId = key.trim();
    if (!sectionId || !BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId]) continue;
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
  if (!BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId]) return next;
  if (!blobId) {
    delete next[sectionId];
    return next;
  }
  if (!UUID_RE.test(blobId)) return next;
  next[sectionId] = blobId;
  return next;
}

/** 已整段替换的分区：splice 后不要再回写该区「自由文字覆盖」；
 * 封面/会前/生日/金句仍由表单驱动，必须回写，否则中间改了右侧预览不变。 */
export function formFieldReapplyOptionsForSectionOverrides(
  overrides: SectionPptxOverrides | null | undefined,
): BulletinFormFieldReapplyOptions {
  const ids = new Set(Object.keys(normalizeSectionPptxOverrides(overrides)));
  const formDriven = new Set(['cover', 'pre_service', 'birthday', 'verse_of_week', 'offering']);
  const skipSlideNumbers = new Set<number>();
  for (const sectionId of ids) {
    if (formDriven.has(sectionId)) continue;
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
