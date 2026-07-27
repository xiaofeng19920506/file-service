import JSZip, { type JSZipInstance } from './jszip';
import { listPptxSlidesInPresentationOrder } from './pptx-preview';
import { duplicateSlideInZip, removeSlidesFromPptxZip } from './pptx-duplicate-slide';

type PptxBytes = ArrayBuffer | Uint8Array | Blob;

function slideNumber(path: string): number {
  return Number.parseInt(path.match(/slide(\d+)\.xml$/)?.[1] ?? '0', 10);
}

function slidePathForFile(fileNum: number): string {
  return `ppt/slides/slide${fileNum}.xml`;
}

function slideRelsPath(slidePath: string): string {
  return slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
}

function nextMediaName(zip: JSZipInstance, ext: string): string {
  const existing = Object.keys(zip.files)
    .filter((n) => n.startsWith('ppt/media/'))
    .map((n) => n.replace(/^ppt\/media\//, ''));
  let i = 1;
  while (existing.includes(`image${i}.${ext}`)) i += 1;
  return `ppt/media/image${i}.${ext}`;
}

function extFromPath(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] ?? 'png').toLowerCase();
}

function relTargetToMediaPath(target: string): string {
  const normalized = target.replace(/\\/g, '/');
  if (normalized.startsWith('ppt/')) return normalized;
  if (normalized.startsWith('../media/')) return `ppt/media/${normalized.slice('../media/'.length)}`;
  if (normalized.startsWith('media/')) return `ppt/${normalized}`;
  return `ppt/media/${normalized.split('/').pop() ?? normalized}`;
}

async function toArrayBuffer(pptx: PptxBytes): Promise<ArrayBuffer> {
  if (pptx instanceof Blob) return pptx.arrayBuffer();
  if (pptx instanceof Uint8Array) {
    const copy = new Uint8Array(pptx.byteLength);
    copy.set(pptx);
    return copy.buffer;
  }
  return pptx;
}

async function writeMiniSlideOntoBase(
  baseZip: JSZipInstance,
  miniZip: JSZipInstance,
  basePath: string,
  miniPath: string,
): Promise<void> {
  const miniSlideEntry = miniZip.file(miniPath);
  if (!miniSlideEntry) return;
  const slideXml = await miniSlideEntry.async('string');
  const miniRelsPath = slideRelsPath(miniPath);
  const baseRelsPath = slideRelsPath(basePath);
  const miniRelsEntry = miniZip.file(miniRelsPath);
  let relsXml = miniRelsEntry ? await miniRelsEntry.async('string') : null;

  if (relsXml) {
    const mediaMap = new Map<string, string>();
    for (const m of relsXml.matchAll(/<Relationship([^>]*Target="([^"]+)"[^>]*)\/?>/g)) {
      const target = m[2]!;
      if (!target.includes('media/')) continue;
      const srcPath = relTargetToMediaPath(target);
      const src = miniZip.file(srcPath);
      if (!src) continue;
      const ext = extFromPath(srcPath);
      const destPath = nextMediaName(baseZip, ext);
      baseZip.file(destPath, await src.async('uint8array'));
      const destName = destPath.replace(/^ppt\/media\//, '');
      mediaMap.set(target, `../media/${destName}`);
    }
    for (const [from, to] of mediaMap) {
      relsXml = relsXml.split(from).join(to);
    }
    baseZip.file(baseRelsPath, relsXml);
  }

  baseZip.file(basePath, slideXml);
}

/**
 * 将迷你 PPT（分区编辑结果）按顺序对齐到 base。
 * 页数不同时：多则插入、少则删掉锚点尾部（与 shared 实现一致）。
 */
export async function spliceSectionSlidesIntoPptx(
  basePptx: PptxBytes,
  sectionMiniPptx: PptxBytes,
  targetSlideInFiles: readonly number[],
): Promise<Uint8Array> {
  const targets = targetSlideInFiles
    .filter((n) => Number.isFinite(n) && n >= 1)
    .map((n) => Math.floor(n));
  if (!targets.length) {
    const buf = await toArrayBuffer(basePptx);
    return new Uint8Array(buf);
  }

  const baseBuf = await toArrayBuffer(basePptx);
  const miniBuf = await toArrayBuffer(sectionMiniPptx);
  const baseZip = await JSZip.loadAsync(baseBuf);
  const miniZip = await JSZip.loadAsync(miniBuf);
  const miniOrder = await listPptxSlidesInPresentationOrder(new Blob([miniBuf]));
  const n = miniOrder.length;
  if (n === 0) {
    return baseZip.generateAsync({ type: 'uint8array' });
  }

  const liveTargets = targets.filter((fileNum) => Boolean(baseZip.file(slidePathForFile(fileNum))));
  if (!liveTargets.length) {
    return baseZip.generateAsync({ type: 'uint8array' });
  }

  const overlap = Math.min(n, liveTargets.length);
  let lastPath = slidePathForFile(liveTargets[0]!);

  for (let i = 0; i < overlap; i++) {
    const basePath = slidePathForFile(liveTargets[i]!);
    await writeMiniSlideOntoBase(baseZip, miniZip, basePath, miniOrder[i]!.slidePath);
    lastPath = basePath;
  }

  for (let i = overlap; i < n; i++) {
    const newPath = await duplicateSlideInZip(baseZip, lastPath, { insertAfterPath: lastPath });
    await writeMiniSlideOntoBase(baseZip, miniZip, newPath, miniOrder[i]!.slidePath);
    lastPath = newPath;
  }

  if (n < liveTargets.length) {
    const removePaths = liveTargets
      .slice(n)
      .map((fileNum) => slidePathForFile(fileNum))
      .filter((p) => Boolean(baseZip.file(p)));
    if (removePaths.length) {
      await removeSlidesFromPptxZip(baseZip, removePaths);
    }
  }

  return baseZip.generateAsync({ type: 'uint8array' });
}

/** 对多个分区依次 splice */
export async function spliceAllSectionOverridesIntoPptx(
  basePptx: PptxBytes,
  sections: { slideInFiles: readonly number[]; miniPptx: PptxBytes }[],
): Promise<Uint8Array> {
  let buf: PptxBytes = basePptx;
  for (const section of sections) {
    if (!section.slideInFiles.length) continue;
    buf = await spliceSectionSlidesIntoPptx(buf, section.miniPptx, section.slideInFiles);
  }
  return buf instanceof Uint8Array ? buf : new Uint8Array(await toArrayBuffer(buf));
}

export function slideFileNumbersFromPaths(paths: string[]): number[] {
  return paths.map(slideNumber).filter((n) => n >= 1);
}
