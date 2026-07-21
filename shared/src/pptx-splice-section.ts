import JSZip from 'jszip';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';

type PptxBytes = Buffer | Uint8Array | ArrayBuffer;

function slideNumber(path: string): number {
  return Number.parseInt(path.match(/slide(\d+)\.xml$/)?.[1] ?? '0', 10);
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

/**
 * 将迷你 PPT（分区编辑结果）按顺序覆盖 base 中指定文件号的幻灯片。
 * - 页数相同：逐页替换 XML + media
 * - 页数不同：仍按顺序覆盖前 min 页；多出的迷你页忽略；base 多出的目标页保留（避免破坏 deck 结构）
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
  const count = Math.min(targets.length, miniOrder.length);

  for (let i = 0; i < count; i++) {
    const targetFile = targets[i]!;
    const miniSlide = miniOrder[i]!;
    const basePath = `ppt/slides/slide${targetFile}.xml`;
    const baseRelsPath = `ppt/slides/_rels/slide${targetFile}.xml.rels`;
    const miniPath = miniSlide.slidePath;
    const miniRelsPath = miniPath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';

    const miniSlideEntry = miniZip.file(miniPath);
    if (!miniSlideEntry) continue;
    let slideXml = await miniSlideEntry.async('string');
    const miniRelsEntry = miniZip.file(miniRelsPath);
    let relsXml = miniRelsEntry ? await miniRelsEntry.async('string') : null;

    if (relsXml) {
      const mediaMap = new Map<string, string>();
      for (const m of relsXml.matchAll(
        /<Relationship([^>]*Target="([^"]+)"[^>]*)\/?>/g,
      )) {
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
