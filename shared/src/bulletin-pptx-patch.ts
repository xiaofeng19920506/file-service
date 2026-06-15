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

/** 按非空 <t> 节点序号替换文字，未列出的节点保持模板原样 */
export function applyIndexedTextReplacementsToSlideXml(
  xml: string,
  replacements: { textIndex: number; text: string }[],
): string {
  const byIndex = new Map(replacements.map((r) => [r.textIndex, r.text]));
  let idx = 0;
  return xml.replace(
    /<((?:[\w-]+:)?t)([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?t>/g,
    (full, tag, attrs, content) => {
      if (!content.trim()) return full;
      const current = idx++;
      if (byIndex.has(current)) {
        return `<${tag}${attrs}>${escapeXml(byIndex.get(current)!)}</${tag}>`;
      }
      return full;
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
  const patched = applyIndexedTextReplacementsToSlideXml(xml, [
    { textIndex: 8, text: formatBulletinCoverDate(input.serviceDate) },
    { textIndex: 9, text: input.serviceTime?.trim() || '11:00' },
  ]);
  zip.file(slidePath, patched);
  return zip.generateAsync({ type: 'nodebuffer' });
}
