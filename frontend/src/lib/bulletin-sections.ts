/** 周报左侧完整分区导航（与 template-slide-map / deckPlan.sections 对齐） */

export type BulletinNavSection = {
  id: string;
  labelKey: `bulletin.sections.${string}`;
  /** 动态公告等：直接显示的文案（优先于 labelKey） */
  label?: string;
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
  label?: string;
  editableStepId: string | null;
  groupOnly?: boolean;
  children?: BulletinNavNode[];
};

export const ANNOUNCEMENT_SECTION_PREFIX = 'announcement:';

export function announcementSectionId(itemId: string): string {
  return `${ANNOUNCEMENT_SECTION_PREFIX}${itemId}`;
}

export function parseAnnouncementSectionId(sectionId: string): string | null {
  if (!sectionId.startsWith(ANNOUNCEMENT_SECTION_PREFIX)) return null;
  const id = sectionId.slice(ANNOUNCEMENT_SECTION_PREFIX.length).trim();
  return id || null;
}

export function isAnnouncementSectionId(sectionId: string): boolean {
  return parseAnnouncementSectionId(sectionId) != null;
}

/**
 * 嵌套导航树：message 之前保持扁平；
 * 「大家庭时间」下挂奉献/生日/公告/金句/部门报告/三一颂与祝福；
 * 「公告」为分组：动态公告项 + 受洗 + 本周聚会等（公告项由 buildBulletinNavTree 注入）。
 */
export const BULLETIN_NAV_TREE: BulletinNavNode[] = [
  { id: 'cover', labelKey: 'bulletin.sections.cover', editableStepId: 'cover' },
  { id: 'pre_service', labelKey: 'bulletin.sections.pre_service', editableStepId: 'pre_service' },
  { id: 'scripture', labelKey: 'bulletin.sections.scripture', editableStepId: 'scripture' },
  { id: 'worship', labelKey: 'bulletin.sections.worship', editableStepId: 'worship' },
  { id: 'communion', labelKey: 'bulletin.sections.communion', editableStepId: null },
  { id: 'welcome', labelKey: 'bulletin.sections.welcome', editableStepId: null },
  { id: 'youth_prayer', labelKey: 'bulletin.sections.youth_prayer', editableStepId: null },
  { id: 'testimony_week', labelKey: 'bulletin.sections.testimony_week', editableStepId: null },
  { id: 'message', labelKey: 'bulletin.sections.message', editableStepId: null },
  {
    id: 'family_time',
    labelKey: 'bulletin.sections.family_time',
    editableStepId: null,
    children: [
      { id: 'offering', labelKey: 'bulletin.sections.offering', editableStepId: 'offering' },
      { id: 'birthday', labelKey: 'bulletin.sections.birthday', editableStepId: 'birthday' },
      {
        id: 'announcements_group',
        labelKey: 'bulletin.sections.announcements_group',
        editableStepId: null,
        groupOnly: true,
        children: [
          {
            id: 'baptism',
            labelKey: 'bulletin.sections.baptism',
            editableStepId: 'baptism',
          },
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
        editableStepId: null,
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

export type BulletinAnnouncementNavItem = {
  id: string;
  title?: string | null;
  body?: string | null;
};

function flattenNavTree(nodes: BulletinNavNode[], depth = 0): BulletinNavSection[] {
  const out: BulletinNavSection[] = [];
  for (const node of nodes) {
    const hasChildren = Boolean(node.children?.length);
    out.push({
      id: node.id,
      labelKey: node.labelKey,
      label: node.label,
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

function cloneNavTree(nodes: BulletinNavNode[]): BulletinNavNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNavTree(node.children) : undefined,
  }));
}

/**
 * 注入动态公告子项后的导航树。
 * `announcementLabel`：无标题时的「公告 {n}」文案。
 */
export function buildBulletinNavTree(
  announcements: readonly BulletinAnnouncementNavItem[] | null | undefined,
  announcementLabel: (n: number) => string = (n) => `Announcement ${n}`,
): BulletinNavNode[] {
  const tree = cloneNavTree(BULLETIN_NAV_TREE);
  const group = findNavNode('announcements_group', tree);
  if (!group) return tree;

  const items = announcements ?? [];
  const dynamicChildren: BulletinNavNode[] = items.map((item, index) => {
    const title = (item.title ?? '').trim();
    return {
      id: announcementSectionId(item.id),
      labelKey: 'bulletin.sections.announcement_item',
      label: title || announcementLabel(index + 1),
      editableStepId: 'announcement_item',
    };
  });

  group.children = [...dynamicChildren, ...(group.children ?? [])];
  return tree;
}

export function buildBulletinNavSections(
  announcements: readonly BulletinAnnouncementNavItem[] | null | undefined,
  announcementLabel?: (n: number) => string,
): BulletinNavSection[] {
  return flattenNavTree(buildBulletinNavTree(announcements, announcementLabel));
}

/**
 * 按模板/树 DFS 顺序的全部分区（含分组节点；不含动态公告项）。
 * 编辑页请用 buildBulletinNavSections(draft.announcements)。
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
export function resolveNavTargetSectionId(
  sectionId: string,
  nodes: BulletinNavNode[] = BULLETIN_NAV_TREE,
): string {
  const node = findNavNode(sectionId, nodes);
  if (!node?.groupOnly || !node.children?.length) return sectionId;
  const stack = [...node.children];
  while (stack.length) {
    const cur = stack.shift()!;
    if (!cur.groupOnly) return cur.id;
    if (cur.children?.length) stack.unshift(...cur.children);
  }
  return sectionId;
}

export function navSectionIndexById(
  sectionId: string,
  sections: BulletinNavSection[] = BULLETIN_NAV_SECTIONS,
): number {
  const idx = sections.findIndex((s) => s.id === sectionId);
  return idx >= 0 ? idx : 0;
}

export function navSectionById(
  sectionId: string,
  sections: BulletinNavSection[] = BULLETIN_NAV_SECTIONS,
): BulletinNavSection | undefined {
  return sections.find((s) => s.id === sectionId);
}

export function isReadonlyNavSection(
  sectionId: string,
  sections: BulletinNavSection[] = BULLETIN_NAV_SECTIONS,
): boolean {
  const section = navSectionById(sectionId, sections);
  if (!section) return true;
  if (section.groupOnly) return true;
  return section.editableStepId == null;
}
