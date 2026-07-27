/** 周报左侧完整分区导航（与 template-slide-map / deckPlan.sections 对齐） */

export type BulletinNavSection = {
  id: string;
  labelKey: `bulletin.sections.${string}`;
  /** 对应可编辑向导步；null 表示模板固定页，仅导航预览 */
  editableStepId: string | null;
  /** 树形缩进深度（0 = 顶层） */
  depth: number;
  /** 仅导航分组、无独立模板页 */
  groupOnly?: boolean;
  /** 是否有子分区（用于 UI 样式） */
  hasChildren?: boolean;
};

export type BulletinNavNode = {
  id: string;
  labelKey: `bulletin.sections.${string}`;
  editableStepId: string | null;
  groupOnly?: boolean;
  children?: BulletinNavNode[];
};

/**
 * 嵌套导航树：message 之前保持扁平；
 * 「大家庭时间」下挂奉献/生日/公告/金句/部门报告/三一颂与祝福；
 * 「公告」再嵌套本周聚会、同工会、轮值、下主日见证、下主日服事。
 */
export const BULLETIN_NAV_TREE: BulletinNavNode[] = [
  { id: 'cover', labelKey: 'bulletin.sections.cover', editableStepId: 'cover' },
  { id: 'pre_service', labelKey: 'bulletin.sections.pre_service', editableStepId: 'pre_service' },
  { id: 'scripture', labelKey: 'bulletin.sections.scripture', editableStepId: 'scripture' },
  { id: 'worship', labelKey: 'bulletin.sections.worship', editableStepId: 'worship' },
  { id: 'communion', labelKey: 'bulletin.sections.communion', editableStepId: null },
  { id: 'welcome', labelKey: 'bulletin.sections.welcome', editableStepId: null },
  { id: 'youth_prayer', labelKey: 'bulletin.sections.youth_prayer', editableStepId: null },
  { id: 'testimony_week', labelKey: 'bulletin.sections.testimony_week', editableStepId: 'more' },
  { id: 'message', labelKey: 'bulletin.sections.message', editableStepId: null },
  {
    id: 'family_time',
    labelKey: 'bulletin.sections.family_time',
    editableStepId: null,
    children: [
      { id: 'offering', labelKey: 'bulletin.sections.offering', editableStepId: 'offering' },
      { id: 'birthday', labelKey: 'bulletin.sections.birthday', editableStepId: 'birthday' },
      {
        id: 'announcements',
        labelKey: 'bulletin.sections.announcements',
        editableStepId: 'announcements',
        children: [
          {
            id: 'weekly_meetings',
            labelKey: 'bulletin.sections.weekly_meetings',
            editableStepId: 'more',
          },
          {
            id: 'staff_meeting',
            labelKey: 'bulletin.sections.staff_meeting',
            editableStepId: 'more',
          },
          { id: 'rotation', labelKey: 'bulletin.sections.rotation', editableStepId: 'more' },
          {
            id: 'future_testimony',
            labelKey: 'bulletin.sections.future_testimony',
            editableStepId: 'more',
          },
          {
            id: 'service_roster',
            labelKey: 'bulletin.sections.service_roster',
            editableStepId: 'more',
          },
        ],
      },
      {
        id: 'verse_of_week',
        labelKey: 'bulletin.sections.verse_of_week',
        editableStepId: 'verse',
      },
      {
        id: 'department_reports',
        labelKey: 'bulletin.sections.department_reports',
        editableStepId: 'more',
      },
      {
        id: 'doxology_benediction',
        labelKey: 'bulletin.sections.doxology_benediction',
        editableStepId: null,
        groupOnly: true,
        children: [
          { id: 'doxology', labelKey: 'bulletin.sections.doxology', editableStepId: null },
          { id: 'benediction', labelKey: 'bulletin.sections.benediction', editableStepId: null },
        ],
      },
    ],
  },
];

function flattenNavTree(nodes: BulletinNavNode[], depth = 0): BulletinNavSection[] {
  const out: BulletinNavSection[] = [];
  for (const node of nodes) {
    const hasChildren = Boolean(node.children?.length);
    out.push({
      id: node.id,
      labelKey: node.labelKey,
      editableStepId: node.editableStepId,
      depth,
      groupOnly: node.groupOnly,
      hasChildren,
    });
    if (node.children?.length) {
      out.push(...flattenNavTree(node.children, depth + 1));
    }
  }
  return out;
}

/**
 * 按模板/树 DFS 顺序的全部分区（含分组节点）。
 * 点击后滚到预览该分区首页；有 editableStepId 时切换左侧编辑面板。
 */
export const BULLETIN_NAV_SECTIONS: BulletinNavSection[] = flattenNavTree(BULLETIN_NAV_TREE);

export function findNavNode(
  sectionId: string,
  nodes: BulletinNavNode[] = BULLETIN_NAV_TREE,
): BulletinNavNode | undefined {
  for (const node of nodes) {
    if (node.id === sectionId) return node;
    if (node.children?.length) {
      const found = findNavNode(sectionId, node.children);
      if (found) return found;
    }
  }
  return undefined;
}

/** 分组节点点选时落到第一个可预览子分区 */
export function resolveNavTargetSectionId(sectionId: string): string {
  const node = findNavNode(sectionId);
  if (!node?.groupOnly || !node.children?.length) return sectionId;
  const stack = [...node.children];
  while (stack.length) {
    const cur = stack.shift()!;
    if (!cur.groupOnly) return cur.id;
    if (cur.children?.length) stack.unshift(...cur.children);
  }
  return sectionId;
}

export function navSectionIndexById(sectionId: string): number {
  const idx = BULLETIN_NAV_SECTIONS.findIndex((s) => s.id === sectionId);
  return idx >= 0 ? idx : 0;
}

export function navSectionById(sectionId: string): BulletinNavSection | undefined {
  return BULLETIN_NAV_SECTIONS.find((s) => s.id === sectionId);
}

export function isReadonlyNavSection(sectionId: string): boolean {
  const section = navSectionById(sectionId);
  if (!section) return true;
  if (section.groupOnly) return true;
  return section.editableStepId == null;
}
