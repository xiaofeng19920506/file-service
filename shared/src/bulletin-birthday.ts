/** 生日名单：表单多 input ↔ 存库换行字符串；幻灯片用多列 grid 写入 shape 399。 */

export const BIRTHDAY_NAME_MAX = 12;
/** 模板 P24 名单文本框 */
export const BIRTHDAY_NAMES_SHAPE_ID = '399';

/** 名单框宽度（EMU）；与 applyBirthdayNameGridToSlideXml 中 cx 一致 */
const BIRTHDAY_NAMES_BOX_CX = 8_546_400;
const BIRTHDAY_NAMES_INSET = 91_425;
/** 百分子号：44pt 起，最短不低于 26pt */
const BIRTHDAY_FONT_SZ_MAX = 4400;
const BIRTHDAY_FONT_SZ_MIN = 2600;

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

/**
 * 估计名字展示宽度（CJK≈1，西文≈0.55）。
 * 用于列数 / 字号 / 自动排列，避免单名在列内被折到下一行。
 */
export function nameDisplayUnits(name: string): number {
  let units = 0;
  for (const ch of name) {
    if (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)) units += 1;
    else if (/\s/.test(ch)) units += 0.35;
    else units += 0.55;
  }
  return units || 1;
}

/**
 * 中文名优先（拼音序），英文名在后（字母序）；同组短名优先，便于阵列整齐。
 */
export function arrangeBirthdayNames(names: readonly string[]): string[] {
  const list = names.map((s) => s.trim()).filter(Boolean).slice(0, BIRTHDAY_NAME_MAX);
  const isCjk = (s: string) => /[\u4e00-\u9fff]/.test(s);
  return [...list].sort((a, b) => {
    const aCjk = isCjk(a);
    const bCjk = isCjk(b);
    if (aCjk !== bCjk) return aCjk ? -1 : 1;
    const byLocale = a.localeCompare(b, aCjk ? 'zh-Hans' : 'en', { sensitivity: 'base' });
    if (byLocale !== 0) return byLocale;
    return nameDisplayUnits(a) - nameDisplayUnits(b);
  });
}

export function moveBirthdayName(
  names: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  const list = [...names];
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list;
  }
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item!);
  return list;
}

function columnCapacityUnits(cols: number, fontSz: number): number {
  const usable = BIRTHDAY_NAMES_BOX_CX - BIRTHDAY_NAMES_INSET * 2;
  const colEmu = usable / Math.max(cols, 1);
  // 约：1 CJK ≈ fontPt × 12700 EMU；sz 为百分之一 pt
  const cjkEmu = (fontSz / 100) * 12_700;
  return (colEmu * 0.9) / cjkEmu;
}

export function pickBirthdayFontSize(names: readonly string[], cols: number): number {
  const maxUnits = Math.max(1, ...names.map((n) => nameDisplayUnits(n)));
  let sz = BIRTHDAY_FONT_SZ_MAX;
  while (sz > BIRTHDAY_FONT_SZ_MIN && maxUnits > columnCapacityUnits(cols, sz)) {
    sz -= 200;
  }
  return sz;
}

export function birthdayGridColumns(count: number, names?: readonly string[]): number {
  if (count <= 0) return 1;
  let cols = count <= 3 ? 1 : count <= 8 ? 2 : 3;
  if (!names || names.length === 0) return cols;
  // 最长名在最小字号下仍超列宽 → 减列，避免姓名被挤折行
  const maxUnits = Math.max(...names.map((n) => nameDisplayUnits(n)));
  while (cols > 1 && maxUnits > columnCapacityUnits(cols, BIRTHDAY_FONT_SZ_MIN)) {
    cols -= 1;
  }
  return cols;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function nameRunXml(text: string, color: string, fontSz: number): string {
  const t = text.trim() ? escapeXml(text.trim()) : ' ';
  return (
    `<a:r><a:rPr b="1" lang="en" sz="${fontSz}">` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `<a:highlight><a:schemeClr val="dk1"/></a:highlight>` +
    `<a:latin typeface="DFKai-SB"/><a:ea typeface="DFKai-SB"/>` +
    `<a:cs typeface="DFKai-SB"/><a:sym typeface="DFKai-SB"/></a:rPr>` +
    `<a:t>${t}</a:t></a:r>`
  );
}

function tabRunXml(fontSz: number): string {
  return (
    `<a:r><a:rPr b="1" lang="en" sz="${fontSz}">` +
    `<a:solidFill><a:srgbClr val="274E13"/></a:solidFill>` +
    `<a:latin typeface="DFKai-SB"/><a:ea typeface="DFKai-SB"/>` +
    `<a:cs typeface="DFKai-SB"/><a:sym typeface="DFKai-SB"/></a:rPr>` +
    `<a:t xml:space="preserve">\t</a:t></a:r>`
  );
}

function tabListXml(cols: number): string {
  if (cols <= 1) return '';
  const usable = BIRTHDAY_NAMES_BOX_CX - BIRTHDAY_NAMES_INSET * 2;
  const colW = Math.floor(usable / cols);
  const tabs: string[] = [];
  for (let c = 0; c < cols; c++) {
    const center = Math.floor(colW * (c + 0.5));
    tabs.push(`<a:tab pos="${center}" algn="ctr"/>`);
  }
  return `<a:tabLst>${tabs.join('')}</a:tabLst>`;
}

function nameRowParagraphXml(rowNames: string[], cols: number, fontSz: number): string {
  const colors = ['4C1130', '274E13', '1C4587'];
  const runs: string[] = [];
  if (cols <= 1) {
    // 单列：一人一段，居中
    const name = rowNames[0] ?? ' ';
    runs.push(nameRunXml(name, colors[0]!, fontSz));
  } else {
    // 多列：制表位定列中心；每人一个 run，姓名本身不拆行（body wrap=none）
    rowNames.forEach((name, i) => {
      runs.push(tabRunXml(fontSz));
      runs.push(nameRunXml(name, colors[i % colors.length]!, fontSz));
    });
  }
  return (
    `<a:p><a:pPr indent="0" lvl="0" marL="0" rtl="0" algn="${cols <= 1 ? 'ctr' : 'l'}">` +
    tabListXml(cols) +
    `<a:spcBef><a:spcPts val="600"/></a:spcBef>` +
    `<a:spcAft><a:spcPts val="600"/></a:spcAft>` +
    `<a:buNone/></a:pPr>${runs.join('')}` +
    `<a:endParaRPr b="1" sz="${fontSz}"/></a:p>`
  );
}

/** 将名单排成行列（每行最多 cols 个），写入幻灯片 grid；单名不跨行 */
export function buildBirthdayNameGridTxBody(names: readonly string[]): string {
  const list = names.map((s) => s.trim()).filter(Boolean).slice(0, BIRTHDAY_NAME_MAX);
  const cols = birthdayGridColumns(list.length, list);
  const fontSz = pickBirthdayFontSize(list.length ? list : [' '], cols);
  const rows: string[] = [];
  if (list.length === 0) {
    rows.push(nameRowParagraphXml([' '], 1, fontSz));
  } else {
    for (let i = 0; i < list.length; i += cols) {
      rows.push(nameRowParagraphXml(list.slice(i, i + cols), cols, fontSz));
    }
  }
  // wrap=none：禁止 CJK/空格在框内折到下一行，保证一人姓名保持单行
  return (
    `<p:txBody>` +
    `<a:bodyPr anchorCtr="0" anchor="ctr" bIns="91425" lIns="91425" spcFirstLastPara="1" ` +
    `rIns="91425" wrap="none" tIns="91425"><a:noAutofit/></a:bodyPr>` +
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

/**
 * 扩宽 P24 名单框并写入 grid 段落；保留原 shape 几何以外的结构。
 */
export function applyBirthdayNameGridToSlideXml(xml: string, namesRaw: string): string {
  const names = parseBirthdayNames(namesRaw);
  const block = findShapeBlock(xml, BIRTHDAY_NAMES_SHAPE_ID);
  if (!block) return xml;
  let shape = xml.slice(block.start, block.end);

  // 名单区拉满可用宽度，便于多列 grid
  shape = shape.replace(
    /<a:off x="\d+" y="(\d+)"\/>/,
    `<a:off x="298800" y="$1"/>`,
  );
  shape = shape.replace(
    /<a:ext cx="\d+" cy="(\d+)"\/>/,
    `<a:ext cx="${BIRTHDAY_NAMES_BOX_CX}" cy="$1"/>`,
  );

  const txStart = shape.indexOf('<p:txBody>');
  const txEnd = shape.indexOf('</p:txBody>');
  if (txStart < 0 || txEnd < 0) return xml;
  shape =
    shape.slice(0, txStart) +
    buildBirthdayNameGridTxBody(names) +
    shape.slice(txEnd + '</p:txBody>'.length);

  return xml.slice(0, block.start) + shape + xml.slice(block.end);
}
