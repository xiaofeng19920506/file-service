import type { SlideTextOverride } from '../api/bulletins';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from './bulletin-section-visibility';

/** 合并某分区内的文字覆盖：保留其他分区，替换本分区各页 */
export function mergeSectionSlideTextOverrides(
  existing: readonly SlideTextOverride[] | null | undefined,
  sectionId: string,
  sectionOverrides: readonly SlideTextOverride[],
): SlideTextOverride[] {
  const slides = BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId] ?? [];
  const sectionSet = new Set(slides);
  const kept = (existing ?? []).filter((o) => !sectionSet.has(o.slide));
  const next = [...kept, ...sectionOverrides];
  const seen = new Set<string>();
  const out: SlideTextOverride[] = [];
  for (const item of next) {
    if (!Number.isFinite(item.slide) || item.slide < 1) continue;
    if (!Number.isFinite(item.textIndex) || item.textIndex < 0) continue;
    if (typeof item.text !== 'string') continue;
    const key = `${Math.floor(item.slide)}:${Math.floor(item.textIndex)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      slide: Math.floor(item.slide),
      textIndex: Math.floor(item.textIndex),
      text: item.text,
    });
  }
  return out;
}

export function overridesForSection(
  existing: readonly SlideTextOverride[] | null | undefined,
  sectionId: string,
): SlideTextOverride[] {
  const slides = new Set(BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId] ?? []);
  return (existing ?? []).filter((o) => slides.has(o.slide));
}
