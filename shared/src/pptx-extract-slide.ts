import JSZip from 'jszip';
import { removeSlidesFromPptxZip } from './pptx-duplicate-slide.js';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';

/**
 * 按演示顺序抽出单页 PPTX（该页成为唯一一页）。
 * 预览必须走这条路径再渲染第 1 页：LibreOffice/PDF 在读经加页后
 * 可能按 slide 文件号排页，导致「演示第 N 页」对不上圣餐等分区正文。
 */
export async function extractPresentationSlideAsPptx(
  pptx: Buffer | Uint8Array | ArrayBuffer,
  presentationIndex: number,
): Promise<Uint8Array> {
  if (!Number.isFinite(presentationIndex) || presentationIndex < 1) {
    throw new Error(`invalid_slide:${presentationIndex}`);
  }

  const order = await listPptxSlidesInPresentationOrder(pptx);
  const target = order.find((s) => s.index === presentationIndex);
  if (!target) {
    throw new Error(`slide_not_found:${presentationIndex}`);
  }

  const removePaths = order
    .filter((s) => s.index !== presentationIndex)
    .map((s) => s.slidePath);

  const zip = await JSZip.loadAsync(pptx);
  if (removePaths.length) {
    await removeSlidesFromPptxZip(zip, removePaths);
  }
  return zip.generateAsync({ type: 'uint8array' });
}
