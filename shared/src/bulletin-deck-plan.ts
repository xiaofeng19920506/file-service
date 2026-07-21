import {
  BULLETIN_SECTION_TEMPLATE_SLIDES,
  bulletinSlidePathsToDelete,
} from './bulletin-section-visibility.js';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';

export type BulletinDeckSlide = {
  index: number;
  slideInFile: number;
  sectionId: string;
};

export type BulletinDeckSection = {
  id: string;
  slides: number[];
};

export type BulletinDeckPlanCore = {
  totalSlides: number;
  slides: BulletinDeckSlide[];
  sections: BulletinDeckSection[];
};

/**
 * 按模板正文划分的分区（读完 06_14_2026.pptx 全部 38 页，含未进 deck 的 P3）。
 * 键为 slide 文件号；演示页码随删页/读经加页变化，归属只认文件号。
 */
export const BULLETIN_TEMPLATE_SLIDE_SECTIONS: { id: string; slides: readonly number[] }[] =
  Object.entries(BULLETIN_SECTION_TEMPLATE_SLIDES).map(([id, slides]) => ({ id, slides }));

/** 始终省略：P3 与 P2 同为「主席會前禱告」但为多人名单 */
export const BULLETIN_OMITTED_TEMPLATE_SLIDES = [3] as const;

function buildSlideInFileToSection(
  sections: { id: string; slides: readonly number[] }[] = BULLETIN_TEMPLATE_SLIDE_SECTIONS,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const section of sections) {
    for (const slide of section.slides) {
      map.set(slide, section.id);
    }
  }
  return map;
}

/**
 * 按演示顺序打分区：只认模板 slide 文件号。
 * 读经复制加页（文件号大于模板最大锚点）延续当前分区。
 * 模板范围内未登记页标 unknown，绝不就近并入上一分区。
 */
export function assignSectionsInPresentationOrder(
  parsed: readonly { index: number; slideInFile: number }[],
  templateSections: { id: string; slides: readonly number[] }[] = BULLETIN_TEMPLATE_SLIDE_SECTIONS,
): BulletinDeckSlide[] {
  const slideInFileToSection = buildSlideInFileToSection(templateSections);
  const omitted = new Set<number>(BULLETIN_OMITTED_TEMPLATE_SLIDES);
  const maxTemplateSlide = Math.max(0, ...slideInFileToSection.keys());
  let currentSectionId = templateSections[0]?.id ?? 'unknown';

  const assigned: BulletinDeckSlide[] = [];
  for (const slide of parsed) {
    if (omitted.has(slide.slideInFile)) continue;
    const mapped = slideInFileToSection.get(slide.slideInFile);
    if (mapped) {
      currentSectionId = mapped;
    } else if (slide.slideInFile <= maxTemplateSlide) {
      assigned.push({
        index: slide.index,
        slideInFile: slide.slideInFile,
        sectionId: 'unknown',
      });
      continue;
    }
    assigned.push({
      index: slide.index,
      slideInFile: slide.slideInFile,
      sectionId: currentSectionId,
    });
  }
  return assigned;
}

export function groupDeckSections(slides: BulletinDeckSlide[]): BulletinDeckSection[] {
  const order: string[] = [];
  const byId = new Map<string, number[]>();
  for (const slide of slides) {
    if (!byId.has(slide.sectionId)) {
      byId.set(slide.sectionId, []);
      order.push(slide.sectionId);
    }
    byId.get(slide.sectionId)!.push(slide.index);
  }
  return order.map((id) => ({ id, slides: byId.get(id)! }));
}

/** 从已与预览 PNG 同一套补丁的 PPTX 字节生成分区（页码与 PNG API 一致） */
export async function buildBulletinDeckPlanFromPptxBytes(
  pptx: Buffer | Uint8Array | ArrayBuffer,
): Promise<BulletinDeckPlanCore> {
  const parsed = await listPptxSlidesInPresentationOrder(pptx);
  const slides = assignSectionsInPresentationOrder(parsed);
  const sections = groupDeckSections(slides);
  return {
    totalSlides: slides.length,
    slides,
    sections,
  };
}

/** 校验：隐藏分区删页列表不会误删其它分区锚点 */
export function assertSectionSlideMapCoversTemplate(): void {
  const covered = new Set<number>();
  for (const slides of Object.values(BULLETIN_SECTION_TEMPLATE_SLIDES)) {
    for (const n of slides) {
      if (covered.has(n)) throw new Error(`duplicate_section_slide:${n}`);
      covered.add(n);
    }
  }
  for (let n = 1; n <= 38; n++) {
    if (n === 3) continue;
    if (!covered.has(n)) throw new Error(`unmapped_template_slide:${n}`);
  }
  // P3 必须在删页列表中
  const deleted = bulletinSlidePathsToDelete({});
  if (!deleted.includes('ppt/slides/slide3.xml')) {
    throw new Error('slide3_must_always_omit');
  }
}
