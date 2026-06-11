import { reindexSlides, slideIdentity, type EditableSlide } from './pptx-preview.js';

export function cloneSlides(slides: EditableSlide[]): EditableSlide[] {
  return slides.map((s) => ({
    ...s,
    textLines: [...s.textLines],
    imageUrls: [...s.imageUrls],
    imageMediaPaths: [...s.imageMediaPaths],
    imageReplacements: s.imageReplacements ? { ...s.imageReplacements } : undefined,
    imagePreviewUrls: s.imagePreviewUrls ? { ...s.imagePreviewUrls } : undefined,
  }));
}

export const SLIDE_HISTORY_MAX = 50;

/** 该页是否允许从预览中移除（跳过） */
export function canRemoveSlide(slide: EditableSlide, allSlides: EditableSlide[]): boolean {
  const sameFile = allSlides.filter(
    (s) => s.sourceItemId === slide.sourceItemId && !s.pending,
  );
  return !!(slide.pending || slide.isNew || sameFile.length > 1 || allSlides.length > 1);
}

/** 批量跳过后是否仍满足「每文件至少一页」 */
export function validateBatchRemove(
  allSlides: EditableSlide[],
  idsToRemove: Set<string>,
): string | null {
  if (idsToRemove.size === 0) return '请先选择要跳过的页面';
  const after = allSlides.filter((s) => !idsToRemove.has(slideIdentity(s)));
  if (after.length === 0) return '至少保留一页';

  const sourceIds = new Set(
    allSlides.filter((s) => !s.pending && s.sourceItemId).map((s) => s.sourceItemId!),
  );
  for (const sourceId of sourceIds) {
    const beforeCount = allSlides.filter(
      (s) => s.sourceItemId === sourceId && !s.pending,
    ).length;
    if (beforeCount === 0) continue;
    const afterCount = after.filter(
      (s) => s.sourceItemId === sourceId && !s.pending,
    ).length;
    if (afterCount === 0) return '每个文件至少保留一页';
  }
  return null;
}

export function applyBatchRemove(
  allSlides: EditableSlide[],
  idsToRemove: Set<string>,
): EditableSlide[] {
  return reindexSlides(allSlides.filter((s) => !idsToRemove.has(slideIdentity(s))));
}
