/** 与 shared/bulletin-birthday 同逻辑的前端副本（避免整包引入 shared）。 */

export const BIRTHDAY_NAME_MAX = 12;
export const BIRTHDAY_NAMES_SHAPE_ID = '399';

export function parseBirthdayNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[\n,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, BIRTHDAY_NAME_MAX);
}

export function joinBirthdayNames(names: readonly string[]): string {
  return names
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, BIRTHDAY_NAME_MAX)
    .join('\n');
}

export function birthdayGridColumns(count: number): number {
  if (count <= 3) return 1;
  if (count <= 8) return 2;
  return 3;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function nameRunXml(text: string, color: string): string {
  const t = text.trim() ? escapeXml(text.trim()) : ' ';
  return (
    `<a:r><a:rPr b="1" lang="en" sz="4400">` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `<a:highlight><a:schemeClr val="dk1"/></a:highlight>` +
    `<a:latin typeface="DFKai-SB"/><a:ea typeface="DFKai-SB"/>` +
    `<a:cs typeface="DFKai-SB"/><a:sym typeface="DFKai-SB"/></a:rPr>` +
    `<a:t>${t}</a:t></a:r>`
  );
}

function spacerRunXml(): string {
  return (
    `<a:r><a:rPr b="1" lang="en" sz="4400">` +
    `<a:solidFill><a:srgbClr val="274E13"/></a:solidFill>` +
    `<a:latin typeface="DFKai-SB"/><a:ea typeface="DFKai-SB"/>` +
    `<a:cs typeface="DFKai-SB"/><a:sym typeface="DFKai-SB"/></a:rPr>` +
    `<a:t xml:space="preserve">      </a:t></a:r>`
  );
}

function nameRowParagraphXml(rowNames: string[]): string {
  const colors = ['4C1130', '274E13', '1C4587'];
  const runs: string[] = [];
  rowNames.forEach((name, i) => {
    if (i > 0) runs.push(spacerRunXml());
    runs.push(nameRunXml(name, colors[i % colors.length]!));
  });
  return (
    `<a:p><a:pPr indent="0" lvl="0" marL="0" rtl="0" algn="ctr">` +
    `<a:spcBef><a:spcPts val="600"/></a:spcBef>` +
    `<a:spcAft><a:spcPts val="600"/></a:spcAft>` +
    `<a:buNone/></a:pPr>${runs.join('')}` +
    `<a:endParaRPr b="1" sz="4400"/></a:p>`
  );
}

export function buildBirthdayNameGridTxBody(names: readonly string[]): string {
  const list = names.map((s) => s.trim()).filter(Boolean).slice(0, BIRTHDAY_NAME_MAX);
  const cols = birthdayGridColumns(list.length);
  const rows: string[] = [];
  if (list.length === 0) {
    rows.push(nameRowParagraphXml([' ']));
  } else {
    for (let i = 0; i < list.length; i += cols) {
      rows.push(nameRowParagraphXml(list.slice(i, i + cols)));
    }
  }
  return (
    `<p:txBody>` +
    `<a:bodyPr anchorCtr="0" anchor="ctr" bIns="91425" lIns="91425" spcFirstLastPara="1" ` +
    `rIns="91425" wrap="square" tIns="91425"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${rows.join('')}</p:txBody>`
  );
}

function findShapeBlock(xml: string, shapeId: string): { start: number; end: number } | null {
  const marker = `<p:cNvPr id="${shapeId}"`;
  const idIdx = xml.indexOf(marker);
  if (idIdx < 0) return null;
  const start = xml.lastIndexOf('<p:sp>', idIdx);
  const endTag = xml.indexOf('</p:sp>', idIdx);
  if (start < 0 || endTag < 0) return null;
  return { start, end: endTag + '</p:sp>'.length };
}

export function applyBirthdayNameGridToSlideXml(xml: string, namesRaw: string): string {
  const names = parseBirthdayNames(namesRaw);
  const block = findShapeBlock(xml, BIRTHDAY_NAMES_SHAPE_ID);
  if (!block) return xml;
  let shape = xml.slice(block.start, block.end);

  shape = shape.replace(/<a:off x="\d+" y="(\d+)"\/>/, `<a:off x="298800" y="$1"/>`);
  shape = shape.replace(/<a:ext cx="\d+" cy="(\d+)"\/>/, `<a:ext cx="8546400" cy="$1"/>`);

  const txStart = shape.indexOf('<p:txBody>');
  const txEnd = shape.indexOf('</p:txBody>');
  if (txStart < 0 || txEnd < 0) return xml;
  shape =
    shape.slice(0, txStart) +
    buildBirthdayNameGridTxBody(names) +
    shape.slice(txEnd + '</p:txBody>'.length);

  return xml.slice(0, block.start) + shape + xml.slice(block.end);
}
