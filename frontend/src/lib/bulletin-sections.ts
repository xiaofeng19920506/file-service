/** 周报左侧完整分区导航（与 template-slide-map / deckPlan.sections 对齐） */

export type BulletinNavSection = {
  id: string;
  labelKey: `bulletin.sections.${string}`;
  /** 对应可编辑向导步；null 表示模板固定页，仅导航预览 */
  editableStepId: string | null;
};

/**
 * 按模板顺序的全部分区。点击后滚到预览该分区首页；
 * 有 editableStepId 时切换左侧编辑面板，否则显示只读提示。
 */
export const BULLETIN_NAV_SECTIONS: BulletinNavSection[] = [
  { id: 'cover', labelKey: 'bulletin.sections.cover', editableStepId: 'cover' },
  { id: 'pre_service', labelKey: 'bulletin.sections.pre_service', editableStepId: 'pre_service' },
  { id: 'scripture', labelKey: 'bulletin.sections.scripture', editableStepId: 'scripture' },
  { id: 'worship', labelKey: 'bulletin.sections.worship', editableStepId: 'worship' },
  { id: 'communion', labelKey: 'bulletin.sections.communion', editableStepId: null },
  { id: 'welcome', labelKey: 'bulletin.sections.welcome', editableStepId: null },
  { id: 'youth_prayer', labelKey: 'bulletin.sections.youth_prayer', editableStepId: null },
  { id: 'testimony_week', labelKey: 'bulletin.sections.testimony_week', editableStepId: 'more' },
  { id: 'message', labelKey: 'bulletin.sections.message', editableStepId: null },
  { id: 'family_time', labelKey: 'bulletin.sections.family_time', editableStepId: null },
  { id: 'offering', labelKey: 'bulletin.sections.offering', editableStepId: 'offering' },
  { id: 'birthday', labelKey: 'bulletin.sections.birthday', editableStepId: 'birthday' },
  { id: 'announcements', labelKey: 'bulletin.sections.announcements', editableStepId: 'announcements' },
  { id: 'weekly_meetings', labelKey: 'bulletin.sections.weekly_meetings', editableStepId: 'more' },
  { id: 'staff_meeting', labelKey: 'bulletin.sections.staff_meeting', editableStepId: 'more' },
  { id: 'rotation', labelKey: 'bulletin.sections.rotation', editableStepId: 'more' },
  { id: 'future_testimony', labelKey: 'bulletin.sections.future_testimony', editableStepId: 'more' },
  { id: 'service_roster', labelKey: 'bulletin.sections.service_roster', editableStepId: 'more' },
  { id: 'verse_of_week', labelKey: 'bulletin.sections.verse_of_week', editableStepId: 'verse' },
  { id: 'department_reports', labelKey: 'bulletin.sections.department_reports', editableStepId: 'more' },
  { id: 'doxology', labelKey: 'bulletin.sections.doxology', editableStepId: null },
  { id: 'benediction', labelKey: 'bulletin.sections.benediction', editableStepId: null },
];

export function navSectionIndexById(sectionId: string): number {
  const idx = BULLETIN_NAV_SECTIONS.findIndex((s) => s.id === sectionId);
  return idx >= 0 ? idx : 0;
}

export function navSectionById(sectionId: string): BulletinNavSection | undefined {
  return BULLETIN_NAV_SECTIONS.find((s) => s.id === sectionId);
}

export function isReadonlyNavSection(sectionId: string): boolean {
  return navSectionById(sectionId)?.editableStepId == null;
}
