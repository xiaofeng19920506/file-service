/**
 * 模板分区 → 幻灯片文件编号（与 bulletin-deck-plan / template-slide-map 对齐）。
 * 隐藏分区时按此删页。
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
  /** 生日只保留第 2 页（P24）；P23 见 ALWAYS_OMIT */
  birthday: [24],
  announcements: [25, 26, 27],
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

/** 始终删：P3 会前名单；P7/P9 敬拜；P21/P22 奉献；P23 生日提醒页 */
export const BULLETIN_ALWAYS_OMIT_SLIDE_FILES = [3, 7, 9, 21, 22, 23] as const;

const WEEKLY_MEETING_VARIANTS = [28, 29, 30] as const;

export function normalizeHiddenSections(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || !BULLETIN_SECTION_TEMPLATE_SLIDES[id]) continue;
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
 * - 始终删 P3（会前名单）、P7/P9（敬拜多余页，只留 P8）、P21/P22（奉献多余页，只留 P19–P20）、P23（生日提醒，只留 P24）
 * - 隐藏分区对应页
 * - 本週聚会未选中的版式页
 */
export function bulletinSlidePathsToDelete(input: {
  hiddenSections?: string[] | null;
  skipTestimonyWeek?: boolean;
  skipDepartmentReports?: boolean;
  weeklyMeetingVariant?: number | null;
}): string[] {
  const hidden = resolveHiddenSections(input);
  const paths = new Set<string>(
    BULLETIN_ALWAYS_OMIT_SLIDE_FILES.map((n) => slidePath(n)),
  );

  for (const sectionId of hidden) {
    const slides = BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId];
    if (!slides) continue;
    for (const n of slides) paths.add(slidePath(n));
  }

  if (!hidden.includes('weekly_meetings')) {
    const keep = input.weeklyMeetingVariant ?? null;
    for (const n of WEEKLY_MEETING_VARIANTS) {
      if (keep === null || n !== keep) paths.add(slidePath(n));
    }
  }

  return [...paths];
}
