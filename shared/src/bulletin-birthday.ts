/** 生日名单：表单多 input ↔ 存库换行字符串；幻灯片用表格阵列写入 shape 399。 */

export const BIRTHDAY_NAME_MAX = 12;
/** 模板 P24 名单文本框（会被替换为同 id 的表格） */
export const BIRTHDAY_NAMES_SHAPE_ID = '399';

/** 名单区位置/尺寸（EMU）；靠左半幅，底边避开页脚 */
const BIRTHDAY_NAMES_BOX = {
  x: 298_800,
  y: 980_000,
  cx: 4_800_000,
  cy: 2_550_000,
} as const;

/** 百分子号：36pt 起，名单多时再缩小 */
const BIRTHDAY_FONT_SZ_MAX = 3600;
const BIRTHDAY_FONT_SZ_MIN = 2200;

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
 * 估计名字展示宽度。DFKai-SB 西文接近汉字宽，按偏保守估算，避免列内挤爆。
 */
export function nameDisplayUnits(name: string): number {
  let units = 0;
  for (const ch of name) {
    if (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)) units += 1;
    else if (/\s/.test(ch)) units += 0.4;
    else units += 0.85;
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
  const colEmu = BIRTHDAY_NAMES_BOX.cx / Math.max(cols, 1);
  const cjkEmu = (fontSz / 100) * 12_700;
  return (colEmu * 0.82) / cjkEmu;
}

export function pickBirthdayFontSize(names: readonly string[], cols: number): number {
  const maxUnits = Math.max(1, ...names.map((n) => nameDisplayUnits(n)));
  const rowCount = Math.max(1, Math.ceil((names.length || 1) / Math.max(cols, 1)));
  // 行高不够时再压字号，避免名单底边压进页脚
  const rowEmu = BIRTHDAY_NAMES_BOX.cy / rowCount;
  const maxByRow = Math.floor((rowEmu * 0.55) / 127);
  let sz = Math.min(BIRTHDAY_FONT_SZ_MAX, Math.max(BIRTHDAY_FONT_SZ_MIN, maxByRow));
  while (sz > BIRTHDAY_FONT_SZ_MIN && maxUnits > columnCapacityUnits(cols, sz)) {
    sz -= 200;
  }
  return sz;
}

export function birthdayGridColumns(count: number, names?: readonly string[]): number {
  if (count <= 0) return 1;
  let cols = count <= 3 ? 1 : count <= 8 ? 2 : 3;
  if (!names || names.length === 0) return cols;
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

/** 普通空格改为 NBSP，避免渲染器在空格处折行 */
function nonBreakingName(text: string): string {
  return text.trim().replace(/ /g, '\u00A0');
}

function nameRunXml(text: string, color: string, fontSz: number): string {
  const raw = nonBreakingName(text);
  const t = raw ? escapeXml(raw) : ' ';
  return (
    `<a:r><a:rPr b="1" lang="en" sz="${fontSz}">` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `<a:highlight><a:schemeClr val="dk1"/></a:highlight>` +
    `<a:latin typeface="DFKai-SB"/><a:ea typeface="DFKai-SB"/>` +
    `<a:cs typeface="DFKai-SB"/><a:sym typeface="DFKai-SB"/></a:rPr>` +
    `<a:t xml:space="preserve">${t}</a:t></a:r>`
  );
}

function emptyCellXml(): string {
  return (
    `<a:tc>` +
    `<a:txBody><a:bodyPr wrap="none" anchor="ctr" lIns="45720" rIns="45720" tIns="0" bIns="0"/>` +
    `<a:lstStyle/><a:p><a:pPr algn="ctr"/><a:endParaRPr sz="1200"/></a:p></a:txBody>` +
    `<a:tcPr marL="45720" marR="45720" marT="0" marB="0" anchor="ctr"><a:noFill/>` +
    `<a:lnL><a:noFill/></a:lnL><a:lnR><a:noFill/></a:lnR>` +
    `<a:lnT><a:noFill/></a:lnT><a:lnB><a:noFill/></a:lnB></a:tcPr>` +
    `</a:tc>`
  );
}

function nameCellXml(name: string, color: string, fontSz: number): string {
  return (
    `<a:tc>` +
    `<a:txBody><a:bodyPr wrap="none" anchor="ctr" lIns="45720" rIns="45720" tIns="0" bIns="0">` +
    `<a:noAutofit/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr" fontAlgn="ctr"><a:buNone/></a:pPr>` +
    nameRunXml(name, color, fontSz) +
    `<a:endParaRPr b="1" sz="${fontSz}"/></a:p></a:txBody>` +
    `<a:tcPr marL="45720" marR="45720" marT="22860" marB="22860" anchor="ctr"><a:noFill/>` +
    `<a:lnL><a:noFill/></a:lnL><a:lnR><a:noFill/></a:lnR>` +
    `<a:lnT><a:noFill/></a:lnT><a:lnB><a:noFill/></a:lnB></a:tcPr>` +
    `</a:tc>`
  );
}

/**
 * 将名单排成无边框表格阵列：一人一格，单元格 wrap=none，姓名不跨行。
 */
export function buildBirthdayNameGridTableXml(names: readonly string[]): string {
  const list = names.map((s) => s.trim()).filter(Boolean).slice(0, BIRTHDAY_NAME_MAX);
  const cols = birthdayGridColumns(list.length, list);
  const rowCount = Math.max(1, Math.ceil((list.length || 1) / cols));
  const fontSz = pickBirthdayFontSize(list.length ? list : [' '], cols);
  const colors = ['4C1130', '274E13', '1C4587'];
  const colW = Math.floor(BIRTHDAY_NAMES_BOX.cx / cols);
  const rowH = Math.floor(BIRTHDAY_NAMES_BOX.cy / rowCount);
  const grid = Array.from({ length: cols }, () => `<a:gridCol w="${colW}"/>`).join('');

  const rowsXml: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      const name = list[r * cols + c];
      if (name) cells.push(nameCellXml(name, colors[c % colors.length]!, fontSz));
      else cells.push(emptyCellXml());
    }
    rowsXml.push(`<a:tr h="${rowH}">${cells.join('')}</a:tr>`);
  }

  const { x, y, cx, cy } = BIRTHDAY_NAMES_BOX;
  return (
    `<p:graphicFrame>` +
    `<p:nvGraphicFramePr>` +
    `<p:cNvPr id="${BIRTHDAY_NAMES_SHAPE_ID}" name="Birthday Names Grid"/>` +
    `<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>` +
    `<p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">` +
    `<a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>${rowsXml.join('')}</a:tbl>` +
    `</a:graphicData></a:graphic></p:graphicFrame>`
  );
}

function findShapeBlock(xml: string, shapeId: string): { start: number; end: number } | null {
  const marker = `<p:cNvPr id="${shapeId}"`;
  const idIdx = xml.indexOf(marker);
  if (idIdx < 0) return null;
  const spStart = xml.lastIndexOf('<p:sp>', idIdx);
  const gfStart = xml.lastIndexOf('<p:graphicFrame>', idIdx);
  if (gfStart >= 0 && gfStart > spStart) {
    const endTag = xml.indexOf('</p:graphicFrame>', idIdx);
    if (endTag < 0) return null;
    return { start: gfStart, end: endTag + '</p:graphicFrame>'.length };
  }
  if (spStart < 0) return null;
  const endTag = xml.indexOf('</p:sp>', idIdx);
  if (endTag < 0) return null;
  return { start: spStart, end: endTag + '</p:sp>'.length };
}

/**
 * 将 P24 名单 shape 替换为同位置的无边框表格阵列。
 */
export function applyBirthdayNameGridToSlideXml(xml: string, namesRaw: string): string {
  const names = parseBirthdayNames(namesRaw);
  const block = findShapeBlock(xml, BIRTHDAY_NAMES_SHAPE_ID);
  if (!block) return xml;
  return xml.slice(0, block.start) + buildBirthdayNameGridTableXml(names) + xml.slice(block.end);
}
