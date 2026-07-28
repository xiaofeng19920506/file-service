import type { BulletinSlidePreviewParams } from '../api/bulletins';
import { resolveHiddenSections } from './bulletin-section-visibility';

export type BulletinPreviewPatchFields = {
  serviceDate: string;
  serviceTime: string;
  scriptureBook?: string;
  scriptureReference?: string;
  showPreServiceChairName?: boolean;
  preServiceChairNames?: string;
  birthdayMonth?: string;
  birthdayNames?: string;
  verseOfWeek?: string;
  hiddenSections?: string[];
  skipTestimonyWeek?: boolean;
  skipDepartmentReports?: boolean;
  weeklyMeetingVariant?: number | null;
  slideTextOverrides?: BulletinSlidePreviewParams['slideTextOverrides'];
  /** 带上后服务端会拼入分区 PPT 覆盖（字体/样式等） */
  bulletinId?: string;
  /** sectionId:blobId 排序指纹，驱动前端预览缓存失效 */
  sectionPptxKey?: string;
};

/** 把 sectionPptxOverrides 压成稳定缓存指纹 */
export function sectionPptxOverridesKey(
  overrides: Record<string, string> | null | undefined,
): string {
  if (!overrides) return '';
  return Object.entries(overrides)
    .filter(([, blobId]) => !!blobId)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

/**
 * 整份 deck 共用的完整预览参数（封面/会前/读经/生日/覆盖…）。
 * 每一页 PNG 与 deck-plan 必须带同一套参数，否则演示页码或文字会对不上。
 */
export function previewPatchFull(full: BulletinPreviewPatchFields): BulletinSlidePreviewParams {
  const hidden = resolveHiddenSections(full);
  return {
    serviceDate: full.serviceDate,
    serviceTime: full.serviceTime || '11:00',
    scriptureBook: full.scriptureBook,
    scriptureReference: full.scriptureReference,
    showPreServiceChairName: full.showPreServiceChairName,
    preServiceChairNames: full.preServiceChairNames,
    birthdayMonth: full.birthdayMonth,
    birthdayNames: full.birthdayNames,
    verseOfWeek: full.verseOfWeek,
    hiddenSections: hidden,
    weeklyMeetingVariant: full.weeklyMeetingVariant ?? null,
    slideTextOverrides: full.slideTextOverrides,
    bulletinId: full.bulletinId,
    sectionPptxKey: full.sectionPptxKey,
  };
}

/**
 * @deprecated 名称保留兼容旧调用；现已返回完整 patch（不再按分区裁剪）。
 */
export function previewPatchForSection(
  _sectionId: string,
  full: BulletinPreviewPatchFields,
): BulletinSlidePreviewParams {
  return previewPatchFull(full);
}

/** 影响 deck 结构/页码的指纹（经文加页、隐藏分区、variant、分区 PPT） */
export function bulletinStructureRev(params: BulletinSlidePreviewParams): string {
  const hidden = (params.hiddenSections ?? []).slice().sort().join(',');
  return [
    hidden,
    params.scriptureBook ?? '',
    params.scriptureReference ?? '',
    params.weeklyMeetingVariant == null ? '' : String(params.weeklyMeetingVariant),
    params.bulletinId ?? '',
    params.sectionPptxKey ?? '',
  ].join('\0');
}

function fullContentRev(params: BulletinSlidePreviewParams): string {
  return [
    params.serviceDate ?? '',
    params.serviceTime ?? '',
    params.showPreServiceChairName ? '1' : '0',
    params.preServiceChairNames ?? '',
    params.birthdayMonth ?? '',
    params.birthdayNames ?? '',
    params.verseOfWeek ?? '',
  ].join('\0');
}

/** 分区内容指纹：改生日不应废掉崇拜区 PNG */
export function bulletinSectionContentRev(
  sectionId: string | undefined,
  params: BulletinSlidePreviewParams,
): string {
  if (!sectionId) return fullContentRev(params);
  switch (sectionId) {
    case 'cover':
      return [params.serviceDate ?? '', params.serviceTime ?? ''].join('\0');
    case 'pre_service':
      return [
        params.showPreServiceChairName ? '1' : '0',
        params.preServiceChairNames ?? '',
      ].join('\0');
    case 'scripture':
    case 'scripture_zh':
    case 'scripture_en':
      return '';
    case 'birthday':
      return [params.birthdayMonth ?? '', params.birthdayNames ?? ''].join('\0');
    case 'verse':
    case 'verse_of_week':
      return params.verseOfWeek ?? '';
    case 'worship':
    case 'offering':
    case 'announcements':
    case 'communion':
    case 'more':
      // 这些区主要靠 slideTextOverrides / 结构；内容字段不并入
      return '';
    default:
      return fullContentRev(params);
  }
}

/**
 * 前端 PNG 缓存 key：结构 + 本分区内容 + 本页文字覆盖。
 * 传入 sectionId 后，改无关分区字段不会使该页缓存失效。
 */
export function bulletinPreviewCacheKey(
  slideNumber: number,
  params: BulletinSlidePreviewParams,
  sectionId?: string,
): string {
  const overrides = (params.slideTextOverrides ?? [])
    .filter((o) => o.slide === slideNumber)
    .map((o) => `${o.slide}:${o.textIndex}:${o.text}`)
    .join('|');
  return [
    slideNumber,
    bulletinStructureRev(params),
    bulletinSectionContentRev(sectionId, params),
    overrides,
  ].join('\0');
}
