import JSZip from 'jszip';

export type PptxPresentationSlideRef = {
  /** 演示顺序（1-based，与 LibreOffice / 预览 PNG 一致） */
  index: number;
  /** 模板内 slide 文件编号（复制加页会 > 原模板最大号） */
  slideInFile: number;
  slidePath: string;
};

function slideNumber(path: string): number {
  return parseInt(path.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
}

function relTargetToSlidePath(target: string): string {
  const normalized = target.replace(/\\/g, '/');
  if (normalized.startsWith('ppt/')) return normalized;
  if (normalized.startsWith('slides/')) return `ppt/${normalized}`;
  const file = normalized.split('/').pop();
  return file ? `ppt/slides/${file}` : `ppt/slides/${normalized}`;
}

/** 按 presentation.xml 放映顺序列出幻灯片 */
export async function listPptxSlidesInPresentationOrder(
  input: Buffer | Uint8Array | ArrayBuffer,
): Promise<PptxPresentationSlideRef[]> {
  const zip = await JSZip.loadAsync(input);
  const presEntry = zip.file('ppt/presentation.xml');
  const relsEntry = zip.file('ppt/_rels/presentation.xml.rels');
  if (!presEntry || !relsEntry) throw new Error('invalid_pptx');

  const presXml = await presEntry.async('string');
  const relsXml = await relsEntry.async('string');

  const relIdToPath = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
    const target = match[2];
    if (!target.includes('slide')) continue;
    relIdToPath.set(match[1], relTargetToSlidePath(target));
  }
  for (const match of relsXml.matchAll(/<Relationship[^>]*Target="([^"]+)"[^>]*Id="(rId\d+)"/g)) {
    const target = match[1];
    if (!target.includes('slide')) continue;
    if (!relIdToPath.has(match[2])) relIdToPath.set(match[2], relTargetToSlidePath(target));
  }

  const slides: PptxPresentationSlideRef[] = [];
  let index = 0;
  for (const match of presXml.matchAll(/<p:sldId[^>]*r:id="(rId\d+)"[^>]*\/?>/g)) {
    const slidePath = relIdToPath.get(match[1]);
    if (!slidePath || !zip.file(slidePath)) continue;
    index += 1;
    slides.push({
      index,
      slideInFile: slideNumber(slidePath),
      slidePath,
    });
  }
  return slides;
}
