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
 * 按分区只附带会影响该页像素的参数。
 * 避免改会前姓名/封面日期时，其它页的 query 与 effect 依赖一并变化。
 */
export function previewPatchForSection(
  sectionId: string,
  full: BulletinPreviewPatchFields,
): BulletinSlidePreviewParams {
  switch (sectionId) {
    case 'cover':
      return {
        serviceDate: full.serviceDate,
        serviceTime: full.serviceTime || '11:00',
      };
    case 'pre_service':
      return {
        showPreServiceChairName: full.showPreServiceChairName,
        preServiceChairNames: full.preServiceChairNames,
      };
    case 'scripture':
      return {
        scriptureBook: full.scriptureBook,
        scriptureReference: full.scriptureReference,
      };
    default:
      return {};
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
