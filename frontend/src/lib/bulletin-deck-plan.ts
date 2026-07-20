import {
  fetchBulletinTemplateFile,
  fetchScriptureSlideBodies,
  type WeeklyBulletin,
} from '../api/bulletins';
import { buildPreviewMatchingPptx } from './bulletin-preview-pptx';
import { listPptxSlidesInPresentationOrder } from './pptx-preview';
import { BULLETIN_WIZARD_STEPS } from './bulletin-template-steps';
import { BULLETIN_NAV_SECTIONS } from './bulletin-sections';

type TemplateSlideSection = { id: string; slides: number[] };

/**
 * 模板内 slide 文件编号 → 分区（非放映页码）。
 * 分区到演示页码的映射在已补丁预览 PPTX 的 presentation 顺序上解析。
 */
export const BULLETIN_TEMPLATE_SLIDE_SECTIONS: TemplateSlideSection[] = [
  { id: 'cover', slides: [1] },
  { id: 'pre_service', slides: [2, 3] },
  { id: 'scripture', slides: [4, 5, 6] },
  { id: 'worship', slides: [7, 8, 9] },
  { id: 'communion', slides: [10, 11, 12, 13] },
  { id: 'welcome', slides: [14] },
  { id: 'youth_prayer', slides: [15] },
  { id: 'testimony_week', slides: [16] },
  { id: 'message', slides: [17] },
  { id: 'family_time', slides: [18] },
  { id: 'offering', slides: [19, 20, 21, 22] },
  { id: 'birthday', slides: [23, 24] },
  { id: 'announcements', slides: [25, 26, 27] },
  { id: 'weekly_meetings', slides: [28, 29, 30] },
  { id: 'staff_meeting', slides: [31] },
  { id: 'rotation', slides: [32] },
  { id: 'future_testimony', slides: [33] },
  { id: 'service_roster', slides: [34] },
  { id: 'verse_of_week', slides: [35] },
  { id: 'department_reports', slides: [36] },
  { id: 'closing', slides: [37, 38] },
];

/** 向导步骤对应的模板分区 */
export const WIZARD_STEP_SECTION_IDS: Record<string, readonly string[]> = {
  cover: ['cover'],
  scripture: ['scripture'],
  worship: ['worship'],
  offering: ['offering'],
  birthday: ['birthday'],
  announcements: ['announcements'],
  verse: ['verse_of_week'],
  more: ['staff_meeting', 'rotation', 'future_testimony', 'service_roster', 'department_reports'],
};

export type BulletinDeckSlide = {
  /** 演示顺序（1-based，与预览 `data-slide` 一致） */
  index: number;
  /** 模板内 slide 文件编号（复制页会 >38） */
  slideInFile: number;
  sectionId: string;
};

export type BulletinDeckSection = {
  id: string;
  slides: number[];
};

export type BulletinDeckWizardStep = {
  stepId: string;
  slides: number[];
};

export type BulletinDeckPlan = {
  totalSlides: number;
  slides: BulletinDeckSlide[];
  sections: BulletinDeckSection[];
  wizardSteps: BulletinDeckWizardStep[];
};

function buildSlideInFileToSection(sections: TemplateSlideSection[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const section of sections) {
    for (const slide of section.slides) {
      map.set(slide, section.id);
    }
  }
  return map;
}

function assignSectionId(
  slide: { index: number; slideInFile: number },
  worshipPresentationIndex: number,
  slideInFileToSection: Map<number, string>,
): string {
  const direct = slideInFileToSection.get(slide.slideInFile);
  if (direct) return direct;
  if (slide.index < worshipPresentationIndex) return 'scripture';
  return 'unknown';
}

function groupSections(slides: BulletinDeckSlide[]): BulletinDeckSection[] {
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

function buildWizardSteps(sections: BulletinDeckSection[]): BulletinDeckWizardStep[] {
  const sectionSlides = new Map(sections.map((s) => [s.id, s.slides]));
  return BULLETIN_WIZARD_STEPS.map((step) => {
    const sectionIds = WIZARD_STEP_SECTION_IDS[step.id] ?? [step.sectionId];
    const slides: number[] = [];
    for (const sectionId of sectionIds) {
      const nums = sectionSlides.get(sectionId);
      if (nums) slides.push(...nums);
    }
    slides.sort((a, b) => a - b);
    return { stepId: step.id, slides };
  });
}

/**
 * 从已补丁的 PPTX（放映顺序与预览 PNG API 一致）生成分区映射。
 * 演示页码与右侧预览 `data-slide` 一一对应，不依赖模板固定页码。
 */
export async function buildBulletinDeckPlanFromFile(file: Blob): Promise<BulletinDeckPlan> {
  const parsed = await listPptxSlidesInPresentationOrder(file);
  const slideInFileToSection = buildSlideInFileToSection(BULLETIN_TEMPLATE_SLIDE_SECTIONS);
  const worshipPresentationIndex = parsed.find((s) => s.slideInFile === 7)?.index ?? 7;

  const slides: BulletinDeckSlide[] = parsed.map((slide) => ({
    index: slide.index,
    slideInFile: slide.slideInFile,
    sectionId: assignSectionId(slide, worshipPresentationIndex, slideInFileToSection),
  }));

  const sections = groupSections(slides);
  return {
    totalSlides: slides.length,
    slides,
    sections,
    wizardSteps: buildWizardSteps(sections),
  };
}

/**
 * 按当前周报字段生成演示顺序与分区映射（含读经加页）。
 * 须与预览 PNG API 使用同一套补丁逻辑，否则敬拜页码会错位。
 */
export async function buildBulletinDeckPlan(bulletin: WeeklyBulletin): Promise<BulletinDeckPlan> {
  const template = await fetchBulletinTemplateFile();
  const book = bulletin.scriptureBook?.trim() ?? '';
  const reference = bulletin.scriptureReference?.trim() ?? '';
  const scriptureBodies =
    book && reference ? await fetchScriptureSlideBodies(book, reference) : null;
  const file = await buildPreviewMatchingPptx(
    template,
    bulletin,
    scriptureBodies,
    'bulletin-deck-plan.pptx',
  );
  return buildBulletinDeckPlanFromFile(file);
}

/** 按导航顺序拼装预览分区（像 code splitting 后再 compose） */
export function composeDeckSectionsForPreview(plan: BulletinDeckPlan): BulletinDeckSection[] {
  const byId = new Map(plan.sections.map((s) => [s.id, s]));
  const ordered: BulletinDeckSection[] = [];

  for (const nav of BULLETIN_NAV_SECTIONS) {
    const section = byId.get(nav.id);
    if (section?.slides.length) {
      ordered.push({ id: section.id, slides: [...section.slides] });
      byId.delete(nav.id);
    }
  }

  for (const leftover of byId.values()) {
    if (!leftover.slides.length) continue;
    if (leftover.id === 'unknown' && ordered.length) {
      const last = ordered[ordered.length - 1]!;
      last.slides.push(...leftover.slides);
      continue;
    }
    ordered.push({ id: leftover.id, slides: [...leftover.slides] });
  }

  return ordered;
}

/** 预览 deck 中敬拜段的首个演示页（`data-slide`），无 deck 时返回 null */
export function worshipFirstPresentationSlide(
  plan: BulletinDeckPlan | null | undefined,
): number | null {
  if (!plan) return null;
  const worship = plan.wizardSteps.find((w) => w.stepId === 'worship');
  return worship?.slides[0] ?? null;
}

export function worshipSlidesFromPlan(plan: BulletinDeckPlan | null | undefined): number[] {
  if (!plan) return [];
  return plan.sections.find((s) => s.id === 'worship')?.slides ?? [];
}

/** 分区在预览 deck 中的首页（`data-slide`）；无 deck 或不存在该分区时返回 null */
export function firstSlideForSection(
  sectionId: string,
  plan: BulletinDeckPlan | null | undefined,
): number | null {
  if (!plan || !sectionId) return null;
  const section = plan.sections.find((s) => s.id === sectionId);
  return section?.slides[0] ?? null;
}

/** 分区在预览 deck 中的全部演示页 */
export function slidesForSection(
  sectionId: string,
  plan: BulletinDeckPlan | null | undefined,
): number[] {
  if (!plan || !sectionId) return [];
  return plan.sections.find((s) => s.id === sectionId)?.slides ?? [];
}

/** 可见演示页 → 模板分区 id（读经加页归 scripture；unknown 回退到上一已知分区） */
export function sectionIdForSlide(
  slideNumber: number,
  plan: BulletinDeckPlan | null | undefined,
): string | null {
  if (!plan || slideNumber < 1) return null;
  const hit = plan.slides.find((s) => s.index === slideNumber);
  if (!hit) return null;
  if (hit.sectionId !== 'unknown') return hit.sectionId;

  for (let i = slideNumber - 1; i >= 1; i--) {
    const prev = plan.slides.find((s) => s.index === i);
    if (prev && prev.sectionId !== 'unknown') return prev.sectionId;
  }
  return null;
}

export function slidesForWizardStepId(
  stepId: string,
  plan: BulletinDeckPlan | null | undefined,
): number[] {
  if (plan) {
    const entry = plan.wizardSteps.find((w) => w.stepId === stepId);
    if (entry) return entry.slides;
  }
  const step = BULLETIN_WIZARD_STEPS.find((s) => s.id === stepId);
  if (!step) return [];
  return [...step.slides, ...(step.companionStaticSlides ?? [])];
}
