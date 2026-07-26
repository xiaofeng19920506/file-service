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

export function bulletinPreviewCacheKey(
  slideNumber: number,
  params: BulletinSlidePreviewParams,
): string {
  const hidden = (params.hiddenSections ?? []).slice().sort().join(',');
  const overrides = (params.slideTextOverrides ?? [])
    .map((o) => `${o.slide}:${o.textIndex}:${o.text}`)
    .join('|');
  return [
    slideNumber,
    params.serviceDate ?? '',
    params.serviceTime ?? '',
    params.scriptureBook ?? '',
    params.scriptureReference ?? '',
    params.showPreServiceChairName ? '1' : '0',
    params.preServiceChairNames ?? '',
    params.birthdayMonth ?? '',
    params.birthdayNames ?? '',
    params.verseOfWeek ?? '',
    hidden,
    params.weeklyMeetingVariant == null ? '' : String(params.weeklyMeetingVariant),
    overrides,
    params.bulletinId ?? '',
    params.sectionPptxKey ?? '',
  ].join('\0');
}
