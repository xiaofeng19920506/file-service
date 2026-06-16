import JSZip from 'jszip';

/** PPT 封面日期格式：06/14/2026 */
export function formatBulletinCoverDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${m}/${d}/${y}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type TextRunReplacement = {
  textIndex: number;
  text: string;
  /** PPT 字号（pt），如 34 对应 sz="3400" */
  fontSizePt?: number;
};

function isIndexedRunContent(text: string): boolean {
  return Boolean(text.trim()) || /\s/.test(text);
}

/** 按 <a:r> 内文字 run 序号替换（含仅空格的间距 run） */
export function applyIndexedTextReplacementsToSlideXml(
  xml: string,
  replacements: TextRunReplacement[],
): string {
  const byIndex = new Map(replacements.map((r) => [r.textIndex, r]));
  let idx = 0;
  return xml.replace(/<a:r>([\s\S]*?)<\/a:r>/g, (runXml) => {
    const textMatch = runXml.match(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/);
    if (!textMatch) return runXml;
    const content = textMatch[2];
    if (!isIndexedRunContent(content)) return runXml;

    const current = idx++;
    const rep = byIndex.get(current);
    if (!rep) return runXml;

    let updated = runXml.replace(
      /<a:t([^>]*)>[\s\S]*?<\/a:t>/,
      `<a:t$1>${escapeXml(rep.text)}</a:t>`,
    );
    if (rep.fontSizePt !== undefined) {
      const sz = String(Math.round(rep.fontSizePt * 100));
      updated = /<a:rPr[^>]*sz="/.test(updated)
        ? updated.replace(/(<a:rPr[^>]*sz=")\d+(")/, `$1${sz}$2`)
        : updated.replace(/<a:rPr/, `<a:rPr sz="${sz}"`);
    }
    return updated;
  });
}

/** 教会名蓝条 (268) 底边 y=877200 */
const COVER_DATE_LINE_Y_EMU = 987_000;
const COVER_DATE_LINE_PT = 34;

function findShapeBlock(xml: string, shapeId: string): { start: number; end: number } | null {
  const marker = `<p:cNvPr id="${shapeId}"`;
  const idIdx = xml.indexOf(marker);
  if (idIdx < 0) return null;
  const start = xml.lastIndexOf('<p:sp>', idIdx);
  const endTag = xml.indexOf('</p:sp>', idIdx);
  if (start < 0 || endTag < 0) return null;
  return { start, end: endTag + '</p:sp>'.length };
}

function replaceShapeBlock(
  xml: string,
  shapeId: string,
  transform: (block: string) => string,
): string {
  const loc = findShapeBlock(xml, shapeId);
  if (!loc) return xml;
  const block = xml.slice(loc.start, loc.end);
  return xml.slice(0, loc.start) + transform(block) + xml.slice(loc.end);
}

function coverDateRunPr(sz: string): string {
  return `<a:rPr b="1" lang="en-US" dirty="0" sz="${sz}"><a:latin typeface="Corbel"/><a:ea typeface="Corbel"/><a:cs typeface="Corbel"/><a:sym typeface="Corbel"/></a:rPr>`;
}

/**
 * 重写封面日期行 shape 265：单行、统一字号、禁止 spAutoFit 换行，并下移到蓝条下方。
 */
export function patchCoverDateLineInSlideXml(
  xml: string,
  serviceDate: string,
  serviceTime: string,
): string {
  const date = formatBulletinCoverDate(serviceDate);
  const time = serviceTime.trim() || '11:00';
  const sz = String(COVER_DATE_LINE_PT * 100);
  const rPr = coverDateRunPr(sz);
  const paragraph = [
    '<a:p>',
    '<a:pPr indent="0" lvl="0" marL="0" marR="0" rtl="0" algn="ctr">',
    '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc>',
    '<a:buNone/>',
    '</a:pPr>',
    `<a:r>${rPr}<a:t>${escapeXml(date)}</a:t></a:r>`,
    `<a:r>${rPr}<a:t xml:space="preserve">${' '.repeat(18)}</a:t></a:r>`,
    `<a:r>${rPr}<a:t>${escapeXml(time)} </a:t></a:r>`,
    `<a:r>${rPr}<a:t>主日崇拜</a:t></a:r>`,
    '</a:p>',
  ].join('');

  const txBody = [
    '<p:txBody>',
    '<a:bodyPr anchorCtr="0" anchor="t" bIns="45720" lIns="91425" spcFirstLastPara="1" rIns="91425" wrap="none" tIns="45720">',
    '<a:noAutofit/>',
    '</a:bodyPr>',
    '<a:lstStyle/>',
    paragraph,
    '</p:txBody>',
  ].join('');

  return replaceShapeBlock(xml, '265', (shapeXml) => {
    let s = shapeXml.replace(/(<a:off x="\d+" y=")\d+(")/, `$1${COVER_DATE_LINE_Y_EMU}$2`);
    return s.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, txBody);
  });
}

/** @deprecated 使用 patchCoverDateLineInSlideXml；保留供其他步骤 run 替换 */
export function buildCoverSlideTextReplacements(
  serviceDate: string,
  serviceTime: string,
): TextRunReplacement[] {
  const date = formatBulletinCoverDate(serviceDate);
  const time = serviceTime.trim() || '11:00';
  const linePt = COVER_DATE_LINE_PT;
  return [
    { textIndex: 8, text: `${date}${' '.repeat(22)}`, fontSizePt: linePt },
    { textIndex: 9, text: ' '.repeat(20), fontSizePt: linePt },
    { textIndex: 10, text: time, fontSizePt: linePt },
    { textIndex: 11, text: '主日崇拜    ', fontSizePt: linePt },
  ];
}

/** @deprecated 使用 patchCoverDateLineInSlideXml */
export function layoutCoverDateLineShape(xml: string): string {
  return xml;
}

/** 读经 slide 4：书名 run 4、经节 run 5（标题「讀經 / Scripture Reading」不改） */
export function formatScriptureBookRun(book: string): string {
  const trimmed = book.trim();
  if (!trimmed) return '';
  return /\s$/.test(trimmed) ? trimmed : `${trimmed}   `;
}

export function formatScriptureReferenceRun(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) return '';
  return trimmed.startsWith(' ') ? trimmed : ` ${trimmed}`;
}

export function patchScriptureSlideInSlideXml(
  xml: string,
  book: string,
  reference: string,
): string {
  const replacements: TextRunReplacement[] = [];
  const bookRun = formatScriptureBookRun(book);
  const refRun = formatScriptureReferenceRun(reference);
  if (bookRun) replacements.push({ textIndex: 4, text: bookRun });
  if (refRun) replacements.push({ textIndex: 5, text: refRun });
  if (!replacements.length) return xml;
  return applyIndexedTextReplacementsToSlideXml(xml, replacements);
}

export type BulletinPreviewPatchInput = {
  serviceDate?: string;
  serviceTime?: string;
  scriptureBook?: string;
  scriptureReference?: string;
};

/** 预览/导出用：封面 + 读经等可编辑字段 */
export async function patchBulletinPreviewInPptx(
  template: Buffer,
  input: BulletinPreviewPatchInput,
): Promise<Buffer> {
  let buf = template;
  if (input.serviceDate) {
    buf = await patchCoverSlideInPptx(buf, {
      serviceDate: input.serviceDate,
      serviceTime: input.serviceTime,
    });
  }
  const book = input.scriptureBook?.trim() ?? '';
  const reference = input.scriptureReference?.trim() ?? '';
  if (!book && !reference) return buf;

  const zip = await JSZip.loadAsync(buf);
  const slidePath = 'ppt/slides/slide4.xml';
  const entry = zip.file(slidePath);
  if (!entry) return buf;

  const xml = await entry.async('string');
  zip.file(slidePath, patchScriptureSlideInSlideXml(xml, book, reference));
  return zip.generateAsync({ type: 'nodebuffer' });
}

export type CoverSlidePatchInput = {
  serviceDate: string;
  serviceTime?: string;
};

/** 仅修改封面 slide 1 的日期与时间 */
export async function patchCoverSlideInPptx(
  template: Buffer,
  input: CoverSlidePatchInput,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(template);
  const slidePath = 'ppt/slides/slide1.xml';
  const entry = zip.file(slidePath);
  if (!entry) return template;

  const xml = await entry.async('string');
  const patched = patchCoverDateLineInSlideXml(
    xml,
    input.serviceDate,
    input.serviceTime ?? '11:00',
  );
  zip.file(slidePath, patched);
  return zip.generateAsync({ type: 'nodebuffer' });
}
