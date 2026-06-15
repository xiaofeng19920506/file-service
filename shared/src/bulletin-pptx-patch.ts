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

/** 封面日期行：左日期 + 宽间距 + 右时间（同一字号、同一基线） */
export function buildCoverSlideTextReplacements(
  serviceDate: string,
  serviceTime: string,
): TextRunReplacement[] {
  const date = formatBulletinCoverDate(serviceDate);
  const time = serviceTime.trim() || '11:00';
  const linePt = 34;
  return [
    { textIndex: 8, text: `${date}${' '.repeat(12)}`, fontSizePt: linePt },
    { textIndex: 9, text: ' '.repeat(42), fontSizePt: linePt },
    { textIndex: 10, text: `${time} `, fontSizePt: linePt },
    { textIndex: 11, text: '主日崇拜', fontSizePt: linePt },
  ];
}

/** 封面日期行文本框：固定字号、垂直居中，避免 spAutoFit 导致日期与时间高低不齐 */
function stabilizeCoverDateLineBox(xml: string): string {
  return xml.replace(
    /(<p:cNvPr id="265"[\s\S]*?<a:bodyPr)([^>]*)(>)([\s\S]*?)(<\/a:bodyPr>)/,
    (_full, prefix, attrs, gt, inner, endTag) => {
      const nextAttrs = attrs.includes('anchor="')
        ? attrs.replace(/anchor="[^"]*"/, 'anchor="ctr"')
        : `${attrs} anchor="ctr"`;
      const body = inner.replace(/<a:spAutoFit\s*\/?>/, '<a:noAutofit/>');
      return `${prefix}${nextAttrs}${gt}${body}${endTag}`;
    },
  );
}

export type CoverSlidePatchInput = {
  serviceDate: string;
  serviceTime?: string;
};

/** 仅修改封面 slide 1 的日期与时间文字 run */
export async function patchCoverSlideInPptx(
  template: Buffer,
  input: CoverSlidePatchInput,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(template);
  const slidePath = 'ppt/slides/slide1.xml';
  const entry = zip.file(slidePath);
  if (!entry) return template;

  const xml = await entry.async('string');
  const patched = stabilizeCoverDateLineBox(
    applyIndexedTextReplacementsToSlideXml(
      xml,
      buildCoverSlideTextReplacements(input.serviceDate, input.serviceTime ?? '11:00'),
    ),
  );
  zip.file(slidePath, patched);
  return zip.generateAsync({ type: 'nodebuffer' });
}
