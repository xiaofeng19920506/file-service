import { fetchBulletinTemplateFile } from '../api/bulletins';
import type { WeeklyBulletin } from '../api/bulletins';
import { BULLETIN_TEMPLATE_FILENAME, applySlidePatches, patchesForStepAsync } from './bulletin-pptx-patches';
import { buildBulletinPptxFile } from './bulletin-publish';
import { parsePptxSlidesDetailed, type EditableSlide } from './pptx-preview';

/** 从模板加载指定页（不修改任何内容） */
export async function previewTemplateSlides(slideNumbers: number[]): Promise<EditableSlide[]> {
  if (!slideNumbers.length) return [];
  const template = await fetchBulletinTemplateFile();
  const parsed = await parsePptxSlidesDetailed(template, {
    sourceFile: BULLETIN_TEMPLATE_FILENAME,
  });
  return slideNumbers
    .map((n) => parsed.find((s) => s.slideInFile === n))
    .filter((s): s is EditableSlide => Boolean(s));
}

/**
 * 预览指定页：仅对 patches 列出的幻灯片替换文字，其余保持模板原样。
 */
export async function previewPatchedSlides(
  slideNumbers: number[],
  patches: Parameters<typeof applySlidePatches>[1],
): Promise<EditableSlide[]> {
  if (!slideNumbers.length) return [];
  const template = await fetchBulletinTemplateFile();
  const file = await applySlidePatches(template, patches, 'bulletin-preview.pptx');
  const parsed = await parsePptxSlidesDetailed(file, {
    sourceFile: 'bulletin-preview.pptx',
  });
  return slideNumbers
    .map((n) => parsed.find((s) => s.slideInFile === n))
    .filter((s): s is EditableSlide => Boolean(s));
}

/** 当前向导步骤用于图层预览的 PPT（已应用本步补丁） */
export async function previewStepPptxBlob(
  stepId: string,
  bulletin: WeeklyBulletin,
): Promise<Blob> {
  const template = await fetchBulletinTemplateFile();
  const patches = await patchesForStepAsync(stepId, bulletin);
  if (!patches.length) return template;
  return applySlidePatches(template, patches, 'bulletin-preview.pptx');
}

/** 当前向导步骤的预览：只应用本步字段补丁 */
export async function previewStepSlides(
  stepId: string,
  bulletin: WeeklyBulletin,
  slideNumbers: number[],
): Promise<EditableSlide[]> {
  const patches = await patchesForStepAsync(stepId, bulletin);
  if (!patches.length) {
    return previewTemplateSlides(slideNumbers);
  }
  return previewPatchedSlides(slideNumbers, patches);
}

export async function rebuildBulletinSlides(bulletin: WeeklyBulletin): Promise<EditableSlide[]> {
  const pptx = await buildBulletinPptxFile(bulletin);
  return parsePptxSlidesDetailed(pptx, {
    sourceFile: `bulletin-${bulletin.serviceDate}.pptx`,
  });
}

export function preserveSlideIndex(
  prevSlides: EditableSlide[],
  prevIndex: number,
  nextSlides: EditableSlide[],
): number {
  if (!nextSlides.length) return 0;
  const current = prevSlides[prevIndex];
  if (!current) return Math.min(prevIndex, nextSlides.length - 1);
  const byPath = nextSlides.findIndex((s) => s.slidePath === current.slidePath);
  if (byPath >= 0) return byPath;
  const byNumber = nextSlides.findIndex((s) => s.slideInFile === current.slideInFile);
  if (byNumber >= 0) return byNumber;
  return Math.min(prevIndex, nextSlides.length - 1);
}
