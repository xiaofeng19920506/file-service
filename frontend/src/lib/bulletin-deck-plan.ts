import {
  fetchBulletinTemplateFile,
  fetchScriptureSlideBodies,
  type BulletinTemplateSection,
  type WeeklyBulletin,
} from '../api/bulletins';
import { buildPreviewMatchingPptx } from './bulletin-preview-pptx';
import { listPptxSlidesInPresentationOrder } from './pptx-preview';
import { BULLETIN_WIZARD_STEPS } from './bulletin-template-steps';

/** 向导步骤对应的模板分区（`template-slide-map.json` section id） */
export const WIZARD_STEP_SECTION_IDS: Record<string, readonly string[]> = {
  cover: ['cover', 'pre_service'],
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

function buildSlideInFileToSection(sections: BulletinTemplateSection[]): Map<number, string> {
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
 */
export async function buildBulletinDeckPlanFromFile(
  file: Blob,
  templateSections: BulletinTemplateSection[],
): Promise<BulletinDeckPlan> {
  const parsed = await listPptxSlidesInPresentationOrder(file);
  const slideInFileToSection = buildSlideInFileToSection(templateSections);
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
export async function buildBulletinDeckPlan(
  bulletin: WeeklyBulletin,
  templateSections: BulletinTemplateSection[],
): Promise<BulletinDeckPlan> {
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
  return buildBulletinDeckPlanFromFile(file, templateSections);
}

export function worshipSlidesFromPlan(plan: BulletinDeckPlan | null | undefined): number[] {
  if (!plan) return [7, 8, 9];
  return plan.sections.find((s) => s.id === 'worship')?.slides ?? [];
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
