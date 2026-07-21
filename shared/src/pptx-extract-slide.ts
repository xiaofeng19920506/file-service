import JSZip from 'jszip';
import { removeSlidesFromPptxZip } from './pptx-duplicate-slide.js';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';

type PptxBytes = Buffer | Uint8Array | ArrayBuffer;

/**
 * 按演示顺序抽出单页 PPTX（该页成为唯一一页）。
 * 预览必须走这条路径再渲染第 1 页：LibreOffice/PDF 在读经加页后
 * 可能按 slide 文件号排页，导致「演示第 N 页」对不上圣餐等分区正文。
 */
export async function extractPresentationSlideAsPptx(
  pptx: PptxBytes,
  presentationIndex: number,
): Promise<Uint8Array> {
  return extractPresentationSlidesAsPptx(pptx, [presentationIndex]);
}

/**
 * 按演示顺序抽出多页，保留相对放映顺序。
 */
export async function extractPresentationSlidesAsPptx(
  pptx: PptxBytes,
  presentationIndices: readonly number[],
): Promise<Uint8Array> {
  const keep = new Set(
    presentationIndices.filter((n) => Number.isFinite(n) && n >= 1).map((n) => Math.floor(n)),
  );
  if (!keep.size) throw new Error('invalid_slides');

  const order = await listPptxSlidesInPresentationOrder(pptx);
  const keepPaths = new Set(
    order.filter((s) => keep.has(s.index)).map((s) => s.slidePath),
  );
  if (!keepPaths.size) throw new Error('slides_not_found');

  const removePaths = order.filter((s) => !keepPaths.has(s.slidePath)).map((s) => s.slidePath);
  const zip = await JSZip.loadAsync(pptx);
  if (removePaths.length) {
    await removeSlidesFromPptxZip(zip, removePaths);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * 按模板文件号抽出若干页（用于分区迷你 PPT）。
 */
export async function extractSlidesByFileNumbersAsPptx(
  pptx: PptxBytes,
  slideInFiles: readonly number[],
): Promise<Uint8Array> {
  const keepFiles = new Set(
    slideInFiles.filter((n) => Number.isFinite(n) && n >= 1).map((n) => Math.floor(n)),
  );
  if (!keepFiles.size) throw new Error('invalid_slides');

  const order = await listPptxSlidesInPresentationOrder(pptx);
  const presentationIndices = order
    .filter((s) => keepFiles.has(s.slideInFile))
    .map((s) => s.index);
  if (!presentationIndices.length) throw new Error('slides_not_found');
  return extractPresentationSlidesAsPptx(pptx, presentationIndices);
}
