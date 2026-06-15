/** 周报编辑向导步骤（按 PPT 模板分区，静态页后续可标记为跳过） */
export type BulletinWizardStep = {
  id: string;
  sectionId: string;
  slides: number[];
  labelKey:
    | 'bulletin.steps.cover'
    | 'bulletin.steps.offering'
    | 'bulletin.steps.birthday'
    | 'bulletin.steps.announcements'
    | 'bulletin.steps.verse'
    | 'bulletin.steps.more';
  /** 当前是否已实现编辑 UI */
  enabled: boolean;
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
    id: 'offering',
    sectionId: 'offering',
    slides: [19, 20, 21, 22],
    labelKey: 'bulletin.steps.offering',
    enabled: false,
  },
  {
    id: 'birthday',
    sectionId: 'birthday',
    slides: [23, 24],
    labelKey: 'bulletin.steps.birthday',
    enabled: false,
  },
  {
    id: 'announcements',
    sectionId: 'announcements',
    slides: [25, 26, 27],
    labelKey: 'bulletin.steps.announcements',
    enabled: false,
  },
  {
    id: 'verse',
    sectionId: 'verse_of_week',
    slides: [35],
    labelKey: 'bulletin.steps.verse',
    enabled: false,
  },
  {
    id: 'more',
    sectionId: 'more',
    slides: [],
    labelKey: 'bulletin.steps.more',
    enabled: false,
  },
];
