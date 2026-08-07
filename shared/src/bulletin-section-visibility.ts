import {
  BIRTHDAY_LEGACY_SLIDE_FILES,
  BIRTHDAY_MONTH_SLIDES,
} from './bulletin-birthday-months.js';

/**
 * 模板分区 → 幻灯片文件编号（与 bulletin-deck-plan / template-slide-map 对齐）。
 * 隐藏分区时按此删页。
 * 动态公告项 id 为 announcement:<uuid>，不在此表；0 条可见时删 P25/P26。
 */
export const BULLETIN_SECTION_TEMPLATE_SLIDES: Record<string, readonly number[]> = {
  cover: [1],
  pre_service: [2],
  scripture: [4, 5, 6],
  /** 敬拜赞美只保留模板第 2 页（P8）；P7/P9 见 ALWAYS_OMIT */
  worship: [8],
  communion: [10, 11, 12, 13],
  welcome: [14],
  youth_prayer: [15],
  testimony_week: [16],
  message: [17],
  family_time: [18],
  /** 奉献报告只保留前两页（P19–P20）；P21/P22 见 ALWAYS_OMIT */
  offering: [19, 20],
  /** 生日：主模板仅锚点 P24；各月完整页在 templates/bulletin/birthday/ */
  birthday: [...BIRTHDAY_MONTH_SLIDES],
  /**
   * 动态公告锚点（P25/P26）；演示归属稍后 remap 为 announcement:<id>。
   * 不出现在左侧导航。
   */
  _announcement_pool: [25, 26],
  /** 受洗典礼 */
  baptism: [27],
  weekly_meetings: [28, 29, 30],
  staff_meeting: [31],
  rotation: [32],
  future_testimony: [33],
  service_roster: [34],
  verse_of_week: [35],
  department_reports: [36],
  doxology: [37],
  benediction: [38],
};

/** 公告模板锚点：无可见公告时整段删除 */
export const BULLETIN_ANNOUNCEMENT_TEMPLATE_SLIDES = [25, 26] as const;

/** 始终删：P3 会前名单；P7/P9 敬拜；P21/P22 奉献；旧生日提醒 P23 */
export const BULLETIN_ALWAYS_OMIT_SLIDE_FILES = [
  3,
  7,
  9,
  21,
  22,
  ...BIRTHDAY_LEGACY_SLIDE_FILES,
] as const;

const WEEKLY_MEETING_VARIANTS = [28, 29, 30] as const;

export const ANNOUNCEMENT_SECTION_PREFIX = 'announcement:';

export function isAnnouncementSectionId(sectionId: string): boolean {
  return sectionId.startsWith(ANNOUNCEMENT_SECTION_PREFIX) && sectionId.length > ANNOUNCEMENT_SECTION_PREFIX.length;
}

export function announcementSectionId(itemId: string): string {
  return `${ANNOUNCEMENT_SECTION_PREFIX}${itemId}`;
}

export function parseAnnouncementSectionId(sectionId: string): string | null {
  if (!isAnnouncementSectionId(sectionId)) return null;
  return sectionId.slice(ANNOUNCEMENT_SECTION_PREFIX.length);
}

/** 过滤掉被隐藏的动态公告项（用于预览/导出 PPT） */
export function filterVisibleAnnouncements<T extends { id: string }>(
  items: readonly T[] | null | undefined,
  hiddenSections: string[] | null | undefined,
): T[] {
  const list = items ?? [];
  const hidden = new Set(resolveHiddenSections({ hiddenSections }));
  return list.filter((item) => !hidden.has(announcementSectionId(item.id)));
}

/** 旧 hiddenSections id → 忽略或映射（特别感谢/家有喜事已改为动态公告） */
const LEGACY_HIDDEN_SECTION_ALIASES: Record<string, readonly string[]> = {
  announcements: [],
  special_thanks: [],
  family_joy: [],
};

export function normalizeHiddenSections(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id) continue;
    if (Object.prototype.hasOwnProperty.call(LEGACY_HIDDEN_SECTION_ALIASES, id)) {
      for (const alias of LEGACY_HIDDEN_SECTION_ALIASES[id] ?? []) {
        if (alias && !out.includes(alias)) out.push(alias);
      }
      continue;
    }
    if (isAnnouncementSectionId(id)) {
      if (!out.includes(id)) out.push(id);
      continue;
    }
    if (!BULLETIN_SECTION_TEMPLATE_SLIDES[id]) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** 合并 hiddenSections 与旧 skip_* 字段 */
export function resolveHiddenSections(input: {
  hiddenSections?: string[] | null;
  skipTestimonyWeek?: boolean;
  skipDepartmentReports?: boolean;
}): string[] {
  const set = new Set(normalizeHiddenSections(input.hiddenSections));
  if (input.skipTestimonyWeek) set.add('testimony_week');
  if (input.skipDepartmentReports) set.add('department_reports');
  return [...set];
}

export function isBulletinSectionVisible(
  sectionId: string,
  input: {
    hiddenSections?: string[] | null;
    skipTestimonyWeek?: boolean;
    skipDepartmentReports?: boolean;
  },
): boolean {
  return !resolveHiddenSections(input).includes(sectionId);
}

export function setBulletinSectionVisible(
  hiddenSections: string[] | null | undefined,
  sectionId: string,
  visible: boolean,
): string[] {
  const next = new Set(normalizeHiddenSections(hiddenSections));
  if (visible) next.delete(sectionId);
  else next.add(sectionId);
  return [...next];
}

function slidePath(n: number): string {
  return `ppt/slides/slide${n}.xml`;
}

/**
 * 需要从 PPTX 删除的 slide 路径：
 * - 始终删 P3 / P7/P9 / P21/P22 / 旧生日提醒 P23
 * - 隐藏分区对应页（含生日锚点 P24）
 * - 可见公告为 0 时删 P25/P26
 * - 本週聚会未选中的版式页
 */
export function bulletinSlidePathsToDelete(input: {
  hiddenSections?: string[] | null;
  skipTestimonyWeek?: boolean;
  skipDepartmentReports?: boolean;
  weeklyMeetingVariant?: number | null;
  /** 保留参数以兼容调用方；不再用于删页 */
  birthdayMonth?: string | number | null;
  /** 未隐藏的公告条数；缺省视为「有公告页」（不因条数删 P25/P26） */
  visibleAnnouncementCount?: number | null;
}): string[] {
  const hidden = resolveHiddenSections(input);
  const paths = new Set<string>(
    BULLETIN_ALWAYS_OMIT_SLIDE_FILES.map((n) => slidePath(n)),
  );

  for (const sectionId of hidden) {
    if (isAnnouncementSectionId(sectionId)) continue;
    if (sectionId === '_announcement_pool') continue;
    const slides = BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId];
    if (!slides) continue;
    for (const n of slides) paths.add(slidePath(n));
  }

  if (input.visibleAnnouncementCount === 0) {
    for (const n of BULLETIN_ANNOUNCEMENT_TEMPLATE_SLIDES) {
      paths.add(slidePath(n));
    }
  } else if (
    input.visibleAnnouncementCount != null &&
    input.visibleAnnouncementCount > 0
  ) {
    // 公告一律用 P25 + 复制页；模板 P26（家有喜事 / layout12）必须删掉，否则黑屏
    paths.add(slidePath(26));
  }

  if (!hidden.includes('weekly_meetings')) {
    // 未选手动版式或不合法值时默认保留 P28，避免三页全删导致左侧点不中
    const raw = input.weeklyMeetingVariant;
    const keep =
      raw === 28 || raw === 29 || raw === 30 ? raw : 28;
    for (const n of WEEKLY_MEETING_VARIANTS) {
      if (n !== keep) paths.add(slidePath(n));
    }
  }

  return [...paths];
}
