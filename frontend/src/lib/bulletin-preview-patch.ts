import type { BulletinSlidePreviewParams } from '../api/bulletins';
import { resolveHiddenSections } from './bulletin-section-visibility';

export type BulletinPreviewPatchFields = {
  serviceDate: string;
  serviceTime: string;
  scriptureBook?: string;
  scriptureReference?: string;
  showPreServiceChairName?: boolean;
  preServiceChairNames?: string;
  hiddenSections?: string[];
  skipTestimonyWeek?: boolean;
  skipDepartmentReports?: boolean;
  weeklyMeetingVariant?: number | null;
};

function structureParams(full: BulletinPreviewPatchFields): BulletinSlidePreviewParams {
  const hidden = resolveHiddenSections(full);
  return {
    scriptureBook: full.scriptureBook,
    scriptureReference: full.scriptureReference,
    hiddenSections: hidden,
    weeklyMeetingVariant: full.weeklyMeetingVariant ?? null,
  };
}

/**
 * 按分区裁剪预览 query。
 * 读经 / 隐藏分区 / 聚会版式会影响演示页码，所有页都必须带同一套结构参数。
 */
export function previewPatchForSection(
  sectionId: string,
  full: BulletinPreviewPatchFields,
): BulletinSlidePreviewParams {
  const structure = structureParams(full);

  switch (sectionId) {
    case 'cover':
      return {
        ...structure,
        serviceDate: full.serviceDate,
        serviceTime: full.serviceTime || '11:00',
      };
    case 'pre_service':
      return {
        ...structure,
        showPreServiceChairName: full.showPreServiceChairName,
        preServiceChairNames: full.preServiceChairNames,
      };
    default:
      return structure;
  }
}

export function bulletinPreviewCacheKey(
  slideNumber: number,
  params: BulletinSlidePreviewParams,
): string {
  const hidden = (params.hiddenSections ?? []).slice().sort().join(',');
  return [
    slideNumber,
    params.serviceDate ?? '',
    params.serviceTime ?? '',
    params.scriptureBook ?? '',
    params.scriptureReference ?? '',
    params.showPreServiceChairName ? '1' : '0',
    params.preServiceChairNames ?? '',
    hidden,
    params.weeklyMeetingVariant == null ? '' : String(params.weeklyMeetingVariant),
  ].join('\0');
}
