import type { BulletinSlidePreviewParams } from '../api/bulletins';

export type BulletinPreviewPatchFields = {
  serviceDate: string;
  serviceTime: string;
  scriptureBook?: string;
  scriptureReference?: string;
  showPreServiceChairName?: boolean;
  preServiceChairNames?: string;
};

/**
 * 按分区裁剪预览 query。
 * 读经加页会改变整份演示页码，因此所有页都必须带同一套经文参数，
 * 否则高页码会按「未加页」PPTX 渲染 → 错页或 503。
 * 封面日期 / 会前主席名只加到对应分区，避免改姓名时整卷 cache miss。
 */
export function previewPatchForSection(
  sectionId: string,
  full: BulletinPreviewPatchFields,
): BulletinSlidePreviewParams {
  const structure: BulletinSlidePreviewParams = {
    scriptureBook: full.scriptureBook,
    scriptureReference: full.scriptureReference,
  };

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

/** 稳定字符串，用作预览 effect / 客户端缓存 key */
export function bulletinPreviewCacheKey(
  slideNumber: number,
  params: BulletinSlidePreviewParams,
): string {
  return [
    slideNumber,
    params.serviceDate ?? '',
    params.serviceTime ?? '',
    params.scriptureBook ?? '',
    params.scriptureReference ?? '',
    params.showPreServiceChairName ? '1' : '0',
    params.preServiceChairNames ?? '',
  ].join('\0');
}
