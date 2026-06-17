/** 封面之后自动接上的固定页（模板原样，不在 stepper 中编辑） */
export const BULLETIN_STATIC_SLIDES_AFTER_COVER = [2] as const;

/** 周报编辑向导步骤（按 PPT 模板分区，静态页后续可标记为跳过） */
export type BulletinWizardStep = {
  id: string;
  sectionId: string;
  slides: number[];
  /** 本步预览额外展示的固定页（只读，无编辑步骤） */
  companionStaticSlides?: readonly number[];
  labelKey:
    | 'bulletin.steps.cover'
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
    companionStaticSlides: BULLETIN_STATIC_SLIDES_AFTER_COVER,
    labelKey: 'bulletin.steps.cover',
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
    slides: [7, 8, 9],
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

/** 敬拜赞美模板页（与 template-slide-map worship 分区一致） */
export const BULLETIN_WORSHIP_SLIDES = [7, 8, 9] as const;

export function isBulletinWorshipSlide(slideNumber: number): boolean {
  return (BULLETIN_WORSHIP_SLIDES as readonly number[]).includes(slideNumber);
}

/** 向导步骤在 PPT 中对应的首页（用于右侧预览滚动定位） */
export function firstSlideForWizardStep(stepIndex: number): number {
  return BULLETIN_WIZARD_STEPS[stepIndex]?.slides[0] ?? 1;
}

function allSlidesForWizardStep(stepIndex: number): number[] {
  const step = BULLETIN_WIZARD_STEPS[stepIndex];
  if (!step) return [];
  return [...step.slides, ...(step.companionStaticSlides ?? [])];
}

/** 根据 PPT 页码推断对应的向导步骤（用于预览滚动反查左侧分区） */
export function wizardStepIndexForSlide(slideNumber: number): number {
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
