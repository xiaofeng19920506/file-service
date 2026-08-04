/**
 * 模板分区 → 幻灯片文件编号（与 shared/bulletin-section-visibility 对齐）。
 * 浏览器侧独立副本，避免 Next 直接解析 shared/src。
 */
import {
  BIRTHDAY_LEGACY_SLIDE_FILES,
  BIRTHDAY_MONTH_SLIDES,
  normalizeBirthdayMonth,
  slideNumberForBirthdayMonth,
  type BirthdayMonth,
} from './bulletin-birthday-months';

export const BULLETIN_SECTION_TEMPLATE_SLIDES: Record<string, readonly number[]> = {
  cover: [1],
  pre_service: [2],
  scripture: [4, 5, 6],
  worship: [8],
  communion: [10, 11, 12, 13],
  welcome: [14],
  youth_prayer: [15],
  testimony_week: [16],
  message: [17],
  family_time: [18],
  offering: [19, 20],
  birthday: [...BIRTHDAY_MONTH_SLIDES],
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

export const BULLETIN_ALWAYS_OMIT_SLIDE_FILES = [
  3,
  7,
  9,
  21,
  22,
  ...BIRTHDAY_LEGACY_SLIDE_FILES,
] as const;

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

export function bulletinSlidePathsToDelete(input: {
  hiddenSections?: string[] | null;
  skipTestimonyWeek?: boolean;
  skipDepartmentReports?: boolean;
  weeklyMeetingVariant?: number | null;
  birthdayMonth?: string | number | null;
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

  if (!hidden.includes('birthday')) {
    const month: BirthdayMonth | null =
      input.birthdayMonth === null || input.birthdayMonth === undefined || input.birthdayMonth === ''
        ? null
        : normalizeBirthdayMonth(input.birthdayMonth);
    const keepSlide = month == null ? null : slideNumberForBirthdayMonth(month);
    for (const n of BIRTHDAY_MONTH_SLIDES) {
      if (keepSlide === null || n !== keepSlide) paths.add(slidePath(n));
    }
  }

  return [...paths];
}
