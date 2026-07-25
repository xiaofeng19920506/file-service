import JSZip from 'jszip';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type SlideBoxPct = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

const DEFAULT_SLIDE_EMU = { cx: 9144000, cy: 5143500 };

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mimeExt(blob: Blob): string {
  const t = (blob.type || '').toLowerCase();
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  return 'png';
}

function nextMediaPath(zip: JSZip, ext: string): string {
  const existing = Object.keys(zip.files)
    .filter((n) => n.startsWith('ppt/media/'))
    .map((n) => n.replace(/^ppt\/media\//, ''));
  let i = 1;
  while (existing.includes(`image${i}.${ext}`)) i += 1;
  return `ppt/media/image${i}.${ext}`;
}

function nextNumericRelId(relsXml: string): string {
  let max = 0;
  for (const m of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    max = Math.max(max, Number(m[1]));
  }
  return `rId${max + 1}`;
}

function nextShapeId(slideXml: string): number {
  let max = 1;
  for (const m of slideXml.matchAll(/<p:cNvPr[^>]*\sid="(\d+)"/g)) {
    max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

async function loadSlideSize(zip: JSZip): Promise<{ cx: number; cy: number }> {
  const entry = zip.file('ppt/presentation.xml');
  if (!entry) return { ...DEFAULT_SLIDE_EMU };
  const xml = await entry.async('string');
  const cx = Number(xml.match(/<p:sldSz[^>]*\scx="(\d+)"/)?.[1] ?? DEFAULT_SLIDE_EMU.cx);
  const cy = Number(xml.match(/<p:sldSz[^>]*\scy="(\d+)"/)?.[1] ?? DEFAULT_SLIDE_EMU.cy);
  return {
    cx: Number.isFinite(cx) && cx > 0 ? cx : DEFAULT_SLIDE_EMU.cx,
    cy: Number.isFinite(cy) && cy > 0 ? cy : DEFAULT_SLIDE_EMU.cy,
  };
}

function boxToEmu(box: SlideBoxPct, slide: { cx: number; cy: number }) {
  return {
    x: Math.round((box.leftPct / 100) * slide.cx),
    y: Math.round((box.topPct / 100) * slide.cy),
    cx: Math.round((box.widthPct / 100) * slide.cx),
    cy: Math.round((box.heightPct / 100) * slide.cy),
  };
}

function insertBeforeSpTreeEnd(slideXml: string, fragment: string): string {
  if (slideXml.includes('</p:spTree>')) {
    return slideXml.replace('</p:spTree>', `${fragment}</p:spTree>`);
  }
  return slideXml;
}

function ensureRelsShell(relsXml: string | null): string {
  return (
    relsXml ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );
}

function ensureImageRelationship(relsXml: string, mediaFileName: string): { relsXml: string; rId: string } {
  const target = `../media/${mediaFileName}`;
  const existing = relsXml.match(
    new RegExp(`Id="(rId\\d+)"[^>]*Target="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
  );
  if (existing) return { relsXml, rId: existing[1]! };
  const rId = nextNumericRelId(relsXml);
  const rel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`;
  const next = relsXml.includes('</Relationships>')
    ? relsXml.replace('</Relationships>', `${rel}</Relationships>`)
    : `${relsXml}${rel}`;
  return { relsXml: next, rId };
}

function buildTextBoxXml(id: number, emu: { x: number; y: number; cx: number; cy: number }, text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const paragraphs =
    lines.length === 0
      ? '<a:p><a:pPr/><a:endParaRPr lang="zh-CN"/></a:p>'
      : lines
          .map((line) => {
            const tTag =
              line === ''
                ? `<a:t xml:space="preserve"> </a:t>`
                : `<a:t>${escapeXml(line)}</a:t>`;
            return `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="zh-CN" sz="2800" dirty="0"/>${tTag}</a:r></a:p>`;
          })
          .join('');
  return `<p:sp>
  <p:nvSpPr>
    <p:cNvPr id="${id}" name="TextBox ${id}"/>
    <p:cNvSpPr txBox="1"/>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm>
      <a:off x="${emu.x}" y="${emu.y}"/>
      <a:ext cx="${emu.cx}" cy="${emu.cy}"/>
    </a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:noFill/>
    <a:ln><a:noFill/></a:ln>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="t"/>
    <a:lstStyle/>
    ${paragraphs}
  </p:txBody>
</p:sp>`;
}

function buildPictureXml(
  id: number,
  rId: string,
  emu: { x: number; y: number; cx: number; cy: number },
): string {
  return `<p:pic>
  <p:nvPicPr>
    <p:cNvPr id="${id}" name="Picture ${id}"/>
    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
    <p:nvPr/>
  </p:nvPicPr>
  <p:blipFill>
    <a:blip r:embed="${rId}"/>
    <a:stretch><a:fillRect/></a:stretch>
  </p:blipFill>
  <p:spPr>
    <a:xfrm>
      <a:off x="${emu.x}" y="${emu.y}"/>
      <a:ext cx="${emu.cx}" cy="${emu.cy}"/>
    </a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
  </p:spPr>
</p:pic>`;
}

async function withSlideMutation(
  file: Blob,
  slidePath: string,
  mutate: (args: {
    zip: JSZip;
    slideXml: string;
    relsXml: string;
    slideSize: { cx: number; cy: number };
  }) => Promise<{ slideXml: string; relsXml: string }>,
): Promise<File> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file(slidePath);
  if (!entry) {
    return file instanceof File
      ? file
      : new File([file], 'presentation.pptx', { type: PPTX_MIME });
  }
  const relsPath = slidePath
    .replace('ppt/slides/', 'ppt/slides/_rels/')
    .replace('.xml', '.xml.rels');
  const relsEntry = zip.file(relsPath);
  const slideXml = await entry.async('string');
  const relsXml = ensureRelsShell(relsEntry ? await relsEntry.async('string') : null);
  const slideSize = await loadSlideSize(zip);
  const next = await mutate({ zip, slideXml, relsXml, slideSize });
  zip.file(slidePath, next.slideXml);
  zip.file(relsPath, next.relsXml);
  const filename = file instanceof File ? file.name : 'presentation.pptx';
  const out = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([out], filename, { type: PPTX_MIME });
}

/** 在幻灯片上插入文本框 */
export async function insertTextBoxIntoPptx(
  file: Blob,
  slidePath: string,
  opts?: { text?: string; box?: SlideBoxPct },
): Promise<File> {
  const text = opts?.text ?? '双击编辑文字';
  const box = opts?.box ?? { leftPct: 12, topPct: 28, widthPct: 50, heightPct: 18 };
  return withSlideMutation(file, slidePath, async ({ slideXml, relsXml, slideSize }) => {
    const emu = boxToEmu(box, slideSize);
    const id = nextShapeId(slideXml);
    const fragment = buildTextBoxXml(id, emu, text);
    return { slideXml: insertBeforeSpTreeEnd(slideXml, fragment), relsXml };
  });
}

/** 在幻灯片上插入图片 */
export async function insertPictureIntoPptx(
  file: Blob,
  slidePath: string,
  image: Blob,
  opts?: { box?: SlideBoxPct },
): Promise<File> {
  const box = opts?.box ?? { leftPct: 18, topPct: 22, widthPct: 45, heightPct: 42 };
  return withSlideMutation(file, slidePath, async ({ zip, slideXml, relsXml, slideSize }) => {
    const ext = mimeExt(image);
    const mediaPath = nextMediaPath(zip, ext);
    zip.file(mediaPath, await image.arrayBuffer());
    const mediaFileName = mediaPath.replace(/^ppt\/media\//, '');
    const ensured = ensureImageRelationship(relsXml, mediaFileName);
    const emu = boxToEmu(box, slideSize);
    const id = nextShapeId(slideXml);
    const fragment = buildPictureXml(id, ensured.rId, emu);
    return {
      slideXml: insertBeforeSpTreeEnd(slideXml, fragment),
      relsXml: ensured.relsXml,
    };
  });
}
