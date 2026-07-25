/** 需要动 slide rels 的操作（超链接），走一次重打包 */
import JSZip from '../jszip';
import { applyHyperlink } from './insert';

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const HYPERLINK_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

function relsPathFor(slidePath: string): string {
  const at = slidePath.lastIndexOf('/');
  return `${slidePath.slice(0, at)}/_rels/${slidePath.slice(at + 1)}.rels`;
}

function nextRelId(relsXml: string): string {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** 给某个元素内的文字加外部超链接 */
export async function addHyperlinkToSlide(
  file: File,
  slidePath: string,
  elementId: number,
  url: string,
): Promise<File> {
  const zip = await JSZip.loadAsync(file);
  const slideEntry = zip.file(slidePath);
  if (!slideEntry) return file;

  const relsPath = relsPathFor(slidePath);
  const relsEntry = zip.file(relsPath);
  const relsXml =
    (await relsEntry?.async('string')) ??
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  const relId = nextRelId(relsXml);
  const relTag = `<Relationship Id="${relId}" Type="${HYPERLINK_TYPE}" Target="${escapeAttr(url)}" TargetMode="External"/>`;
  const nextRels = relsXml.replace('</Relationships>', `${relTag}</Relationships>`);

  const slideXml = await slideEntry.async('string');
  const nextSlide = applyHyperlink(slideXml, elementId, relId);
  if (nextSlide === slideXml) return file;

  zip.file(relsPath, nextRels);
  zip.file(slidePath, nextSlide);
  const out = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([out], file.name, { type: PPTX_MIME });
}
