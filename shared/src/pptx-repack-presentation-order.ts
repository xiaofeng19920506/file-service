import JSZip from 'jszip';
import { removeSlidesFromPptxZip } from './pptx-duplicate-slide.js';
import { listPptxSlidesInPresentationOrder } from './pptx-presentation-order.js';

type PptxBytes = Buffer | Uint8Array | ArrayBuffer;

function slideRelsPath(slidePath: string): string {
  return slidePath.replace('ppt/slides/', 'ppt/slides/_rels/').replace(/\.xml$/, '.xml.rels');
}

function relTargetToMediaPath(target: string): string {
  const normalized = target.replace(/\\/g, '/');
  if (normalized.startsWith('ppt/')) return normalized;
  if (normalized.startsWith('../media/')) return `ppt/media/${normalized.slice('../media/'.length)}`;
  if (normalized.startsWith('media/')) return `ppt/${normalized}`;
  return `ppt/media/${normalized.split('/').pop() ?? normalized}`;
}

async function addSlideContentType(zip: JSZip, slidePath: string): Promise<void> {
  const ctPath = '[Content_Types].xml';
  const entry = zip.file(ctPath);
  if (!entry) return;
  const norm = `/${slidePath}`;
  let xml = await entry.async('string');
  if (xml.includes(`PartName="${norm}"`)) return;
  const override = `<Override PartName="${norm}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  zip.file(ctPath, xml.replace('</Types>', `${override}</Types>`));
}

/** 删除未被任何 .rels 引用的 ppt/media，缩小 LO 输入 */
export async function pruneUnusedPptxMedia(zip: JSZip): Promise<number> {
  const used = new Set<string>();
  for (const name of Object.keys(zip.files)) {
    if (!name.includes('_rels/') || !name.endsWith('.rels') || zip.files[name]?.dir) continue;
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async('string');
    for (const m of xml.matchAll(/Target="([^"]+)"/g)) {
      const t = m[1] ?? '';
      if (!t.includes('media/')) continue;
      used.add(relTargetToMediaPath(t));
    }
  }
  let removed = 0;
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('ppt/media/') || zip.files[name]?.dir) continue;
    if (used.has(name)) continue;
    zip.remove(name);
    removed += 1;
  }
  return removed;
}

/**
 * 将幻灯片文件重排为 slide1..N（与 presentation.xml 放映顺序一致），并清理未引用媒体。
 * LibreOffice 转 PDF 后页码即可与演示页码一一对应，从而整包转一次 PDF、按页 pdftoppm。
 */
export async function repackPptxInPresentationOrder(pptx: PptxBytes): Promise<Uint8Array> {
  const order = await listPptxSlidesInPresentationOrder(pptx);
  if (!order.length) throw new Error('no_slides');

  const zip = await JSZip.loadAsync(pptx);
  const alreadySequential = order.every((s, i) => s.index === i + 1 && s.slideInFile === i + 1);

  if (!alreadySequential) {
    type SlideBlob = { xml: string; rels: string | null };
    const blobs: SlideBlob[] = [];
    for (const s of order) {
      const slideEntry = zip.file(s.slidePath);
      if (!slideEntry) throw new Error(`slide_missing:${s.slidePath}`);
      const relsEntry = zip.file(slideRelsPath(s.slidePath));
      blobs.push({
        xml: await slideEntry.async('string'),
        rels: relsEntry ? await relsEntry.async('string') : null,
      });
    }

    const allSlidePaths = Object.keys(zip.files).filter((n) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
    await removeSlidesFromPptxZip(zip, allSlidePaths);

    const presPath = 'ppt/presentation.xml';
    const relsPath = 'ppt/_rels/presentation.xml.rels';
    const presEntry = zip.file(presPath);
    const relsEntry = zip.file(relsPath);
    if (!presEntry || !relsEntry) throw new Error('invalid_pptx');

    let presXml = await presEntry.async('string');
    let presRels = await relsEntry.async('string');

    // 清掉残留的 slide Relationship（remove 后理论上已空，再保险一遍）
    presRels = presRels.replace(
      /<Relationship[^>]*Target="[^"]*slides\/slide\d+\.xml"[^>]*\/>/g,
      '',
    );
    presRels = presRels.replace(
      /<Relationship[^>]*Target="[^"]*slides\/slide\d+\.xml"[^>]*>\s*<\/Relationship>/g,
      '',
    );
    presXml = presXml.replace(/<p:sldId[^>]*\/>/g, '');

    let nextRel = 1;
    for (const m of presRels.matchAll(/Id="rId(\d+)"/g)) {
      nextRel = Math.max(nextRel, Number.parseInt(m[1]!, 10) + 1);
    }
    let nextSldId = 256;
    for (const m of presXml.matchAll(/<p:sldId id="(\d+)"/g)) {
      nextSldId = Math.max(nextSldId, Number.parseInt(m[1]!, 10) + 1);
    }

    const sldIdParts: string[] = [];
    for (let i = 0; i < blobs.length; i++) {
      const n = i + 1;
      const slidePath = `ppt/slides/slide${n}.xml`;
      const relsFile = `ppt/slides/_rels/slide${n}.xml.rels`;
      const blob = blobs[i]!;
      zip.file(slidePath, blob.xml);
      if (blob.rels) zip.file(relsFile, blob.rels);
      await addSlideContentType(zip, slidePath);

      const relId = `rId${nextRel++}`;
      const sldId = nextSldId++;
      presRels = presRels.replace(
        '</Relationships>',
        `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/></Relationships>`,
      );
      sldIdParts.push(`<p:sldId id="${sldId}" r:id="${relId}"/>`);
    }

    if (presXml.includes('<p:sldIdLst>')) {
      presXml = presXml.replace(
        /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
        `<p:sldIdLst>${sldIdParts.join('')}</p:sldIdLst>`,
      );
    } else {
      presXml = presXml.replace(
        '</p:presentation>',
        `<p:sldIdLst>${sldIdParts.join('')}</p:sldIdLst></p:presentation>`,
      );
    }

    zip.file(presPath, presXml);
    zip.file(relsPath, presRels);
  }

  await pruneUnusedPptxMedia(zip);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
