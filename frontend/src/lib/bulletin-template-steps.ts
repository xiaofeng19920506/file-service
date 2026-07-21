/** 周报编辑向导步骤（按 PPT 模板分区，静态页后续可标记为跳过） */
export type BulletinWizardStep = {
  id: string;
  sectionId: string;
  slides: number[];
  /** 本步预览额外展示的固定页（只读，无编辑步骤） */
  companionStaticSlides?: readonly number[];
  labelKey:
    | 'bulletin.steps.cover'
    | 'bulletin.steps.pre_service'
    | 'bulletin.steps.scripture'
    | 'bulletin.steps.worship'
    | 'bulletin.steps.offering'
    | 'bulletin.steps.birthday'
    | 'bulletin.steps.announcements'
    | 'bulletin.steps.verse'
    | 'bulletin.steps.more';
  /** 当前是否已实现编辑 UI */
  enabled: boolean;
  /** 为 true 时不出现在 stepper（如会前祷告等固定页） */
  skipInStepper?: boolean;
};

export const BULLETIN_WIZARD_STEPS: BulletinWizardStep[] = [
  {
    id: 'cover',
    sectionId: 'cover',
    slides: [1],
    labelKey: 'bulletin.steps.cover',
    enabled: true,
  },
  {
    id: 'pre_service',
    sectionId: 'pre_service',
    slides: [2],
    labelKey: 'bulletin.steps.pre_service',
    enabled: true,
  },
  {
    id: 'scripture',
    sectionId: 'scripture',
    slides: [4, 5, 6],
    labelKey: 'bulletin.steps.scripture',
    enabled: true,
  },
  {
    id: 'worship',
    sectionId: 'worship',
    slides: [8],
    labelKey: 'bulletin.steps.worship',
    enabled: true,
  },
  {
    id: 'offering',
    sectionId: 'offering',
    slides: [19, 20, 21, 22],
    labelKey: 'bulletin.steps.offering',
    enabled: true,
  },
  {
    id: 'birthday',
    sectionId: 'birthday',
    slides: [23, 24],
    labelKey: 'bulletin.steps.birthday',
    enabled: true,
  },
  {
    id: 'announcements',
    sectionId: 'announcements',
    slides: [25, 26, 27],
    labelKey: 'bulletin.steps.announcements',
    enabled: true,
  },
  {
    id: 'verse',
    sectionId: 'verse_of_week',
    slides: [35],
    labelKey: 'bulletin.steps.verse',
    enabled: true,
  },
  {
    id: 'more',
    sectionId: 'more',
    slides: [31, 32, 33, 34, 36],
    labelKey: 'bulletin.steps.more',
    enabled: true,
  },
];

import type { BulletinDeckPlan } from './bulletin-deck-plan';

/** 敬拜赞美模板页（无 deckPlan 时的回退） */
export const BULLETIN_WORSHIP_SLIDES = [8] as const;

export function isBulletinWorshipSlide(slideNumber: number, plan?: BulletinDeckPlan | null): boolean {
  if (plan) {
    const worship = plan.sections.find((s) => s.id === 'worship');
    if (worship) return worship.slides.includes(slideNumber);
  }
  return (BULLETIN_WORSHIP_SLIDES as readonly number[]).includes(slideNumber);
}

/** 向导步骤在预览 deck 中的首页（`data-slide`）；无 deckPlan 时不猜测模板页码 */
export function firstSlideForWizardStep(
  stepIndex: number,
  plan?: BulletinDeckPlan | null,
): number | null {
  const step = BULLETIN_WIZARD_STEPS[stepIndex];
  if (!step || !plan) return null;
  const entry = plan.wizardSteps.find((w) => w.stepId === step.id);
  return entry?.slides[0] ?? null;
}

function allSlidesForWizardStep(stepIndex: number): number[] {
  const step = BULLETIN_WIZARD_STEPS[stepIndex];
  if (!step) return [];
  return [...step.slides, ...(step.companionStaticSlides ?? [])];
}

export function slidesForWizardStep(
  stepIndex: number,
  plan?: BulletinDeckPlan | null,
): number[] {
  const step = BULLETIN_WIZARD_STEPS[stepIndex];
  if (!step) return [];
  if (!plan) return [];
  const entry = plan.wizardSteps.find((w) => w.stepId === step.id);
  return entry?.slides ?? [];
}

/** 根据演示页码推断对应的向导步骤（用于预览滚动反查左侧分区） */
export function wizardStepIndexForSlide(
  slideNumber: number,
  plan?: BulletinDeckPlan | null,
): number {
  if (plan) {
    for (let i = 0; i < BULLETIN_WIZARD_STEPS.length; i++) {
      const entry = plan.wizardSteps.find((w) => w.stepId === BULLETIN_WIZARD_STEPS[i]!.id);
      if (entry?.slides.includes(slideNumber)) return i;
    }
    for (let i = BULLETIN_WIZARD_STEPS.length - 1; i >= 0; i--) {
      const entry = plan.wizardSteps.find((w) => w.stepId === BULLETIN_WIZARD_STEPS[i]!.id);
      const first = entry?.slides[0];
      if (first != null && slideNumber >= first) return i;
    }
    return 0;
  }

  for (let i = 0; i < BULLETIN_WIZARD_STEPS.length; i++) {
    if (allSlidesForWizardStep(i).includes(slideNumber)) return i;
  }
  for (let i = BULLETIN_WIZARD_STEPS.length - 1; i >= 0; i--) {
    const slides = allSlidesForWizardStep(i);
    if (slides.length === 0) continue;
    const first = Math.min(...slides);
    if (slideNumber >= first) return i;
  }
  return 0;
}
