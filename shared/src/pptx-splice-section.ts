import JSZip from 'jszip';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';
import { duplicateSlideInZip, removeSlidesFromPptxZip } from './pptx-duplicate-slide.js';

type PptxBytes = Buffer | Uint8Array | ArrayBuffer;

function slideNumber(path: string): number {
  return Number.parseInt(path.match(/slide(\d+)\.xml$/)?.[1] ?? '0', 10);
}

function slidePathForFile(fileNum: number): string {
  return `ppt/slides/slide${fileNum}.xml`;
}

function slideRelsPath(slidePath: string): string {
  return slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
}

function nextMediaName(zip: JSZip, ext: string): string {
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

/** 把 mini 的一页（含 media）写到 base 的指定 slide 路径 */
async function writeMiniSlideOntoBase(
  baseZip: JSZip,
  miniZip: JSZip,
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
 * 将迷你 PPT（分区编辑结果）按顺序对齐到 base 中指定文件号的幻灯片。
 * - 页数相同：逐页替换 XML + media
 * - mini 更多：在锚点末尾之后 duplicate 插入新页（文件号 > 现有 max，deck-plan 会归属本分区）
 * - mini 更少：按序覆盖前 n 页，并删除锚点尾部多余模板页
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
    return basePptx instanceof Uint8Array
      ? basePptx
      : new Uint8Array(basePptx instanceof ArrayBuffer ? basePptx : basePptx);
  }

  const baseZip = await JSZip.loadAsync(basePptx);
  const miniZip = await JSZip.loadAsync(sectionMiniPptx);
  const miniOrder = await listPptxSlidesInPresentationOrder(sectionMiniPptx);
  const n = miniOrder.length;
  if (n === 0) {
    return baseZip.generateAsync({ type: 'uint8array' });
  }

  // 只保留 base 里仍存在的锚点页（可能已被隐藏分区删掉）
  const liveTargets = targets.filter((fileNum) => Boolean(baseZip.file(slidePathForFile(fileNum))));
  if (!liveTargets.length) {
    return baseZip.generateAsync({ type: 'uint8array' });
  }

  const overlap = Math.min(n, liveTargets.length);
  let lastPath = slidePathForFile(liveTargets[0]!);

  for (let i = 0; i < overlap; i++) {
    const basePath = slidePathForFile(liveTargets[i]!);
    const miniPath = miniOrder[i]!.slidePath;
    await writeMiniSlideOntoBase(baseZip, miniZip, basePath, miniPath);
    lastPath = basePath;
  }

  // mini 比锚点多：在末尾插入新页并写入内容
  for (let i = overlap; i < n; i++) {
    const newPath = await duplicateSlideInZip(baseZip, lastPath, { insertAfterPath: lastPath });
    await writeMiniSlideOntoBase(baseZip, miniZip, newPath, miniOrder[i]!.slidePath);
    lastPath = newPath;
  }

  // mini 比锚点少：删掉锚点尾部多余页
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

/** 对多个分区依次 splice（后写覆盖同页冲突） */
export async function spliceAllSectionOverridesIntoPptx(
  basePptx: PptxBytes,
  sections: { slideInFiles: readonly number[]; miniPptx: PptxBytes }[],
): Promise<Uint8Array> {
  let buf: PptxBytes = basePptx;
  for (const section of sections) {
    if (!section.slideInFiles.length) continue;
    buf = await spliceSectionSlidesIntoPptx(buf, section.miniPptx, section.slideInFiles);
  }
  return buf instanceof Uint8Array
    ? buf
    : new Uint8Array(buf instanceof ArrayBuffer ? buf : buf);
}

export function slideFileNumbersFromPaths(paths: string[]): number[] {
  return paths.map(slideNumber).filter((n) => n >= 1);
}
