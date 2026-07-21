import JSZip from 'jszip';
import { removeSlidesFromPptxZip } from './pptx-duplicate-slide';
import { listPptxSlidesInPresentationOrder } from './pptx-preview';

function toBlob(pptx: ArrayBuffer | Uint8Array | Blob): Blob {
  if (pptx instanceof Blob) return pptx;
  if (pptx instanceof Uint8Array) {
    const copy = new Uint8Array(pptx.byteLength);
    copy.set(pptx);
    return new Blob([copy.buffer]);
  }
  return new Blob([pptx]);
}

/**
 * 按演示顺序抽出多页，保留相对放映顺序。
 * 浏览器侧副本（避免 Next 直接解析 shared/src）。
 */
export async function extractPresentationSlidesAsPptx(
  pptx: ArrayBuffer | Uint8Array | Blob,
  presentationIndices: readonly number[],
): Promise<Uint8Array> {
  const keep = new Set(
    presentationIndices.filter((n) => Number.isFinite(n) && n >= 1).map((n) => Math.floor(n)),
  );
  if (!keep.size) throw new Error('invalid_slides');

  const blob = toBlob(pptx);
  const order = await listPptxSlidesInPresentationOrder(blob);
  const keepPaths = new Set(order.filter((s) => keep.has(s.index)).map((s) => s.slidePath));
  if (!keepPaths.size) throw new Error('slides_not_found');

  const removePaths = order.filter((s) => !keepPaths.has(s.slidePath)).map((s) => s.slidePath);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  if (removePaths.length) {
    await removeSlidesFromPptxZip(zip, removePaths);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

/** 按模板文件号抽出若干页（用于分区迷你 PPT）。 */
export async function extractSlidesByFileNumbersAsPptx(
  pptx: ArrayBuffer | Uint8Array | Blob,
  slideInFiles: readonly number[],
): Promise<Uint8Array> {
  const keepFiles = new Set(
    slideInFiles.filter((n) => Number.isFinite(n) && n >= 1).map((n) => Math.floor(n)),
  );
  if (!keepFiles.size) throw new Error('invalid_slides');

  const blob = toBlob(pptx);
  const order = await listPptxSlidesInPresentationOrder(blob);
  const presentationIndices = order.filter((s) => keepFiles.has(s.slideInFile)).map((s) => s.index);
  if (!presentationIndices.length) throw new Error('slides_not_found');
  return extractPresentationSlidesAsPptx(blob, presentationIndices);
}
