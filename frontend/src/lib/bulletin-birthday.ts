/** 与 shared/bulletin-birthday 同逻辑的前端副本（避免整包引入 shared）。 */

export const BIRTHDAY_NAME_MAX = 12;
/** 模板 P24 原名单文本框 id；替换后首个名字框仍用此 id，便于再次写入 */
export const BIRTHDAY_NAMES_SHAPE_ID = '399';
/** 额外名字框 id 起点（避开模板 400/401 页脚等） */
const BIRTHDAY_EXTRA_ID_BASE = 12_001;

/**
 * 名单区位置/尺寸（EMU）。
 * 加宽加高：多列横排，底边仍在页脚「午餐聚會」之上（footer y≈3.89M）。
 */
const BIRTHDAY_NAMES_BOX = {
  x: 298_800,
  y: 920_000,
  cx: 8_500_000,
  cy: 2_800_000,
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

function birthdayNameShapeId(index: number): string {
  return index === 0 ? BIRTHDAY_NAMES_SHAPE_ID : String(BIRTHDAY_EXTRA_ID_BASE + index - 1);
}

function nameTextBoxXml(
  index: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  color: string,
  fontSz: number,
): string {
  const id = birthdayNameShapeId(index);
  const text = name.trim() ? name : ' ';
  return (
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="${id}" name="Birthday Name ${index}"/>` +
    `<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="none" anchor="ctr" lIns="45720" rIns="45720" tIns="0" bIns="0">` +
    `<a:noAutofit/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr" fontAlgn="ctr"><a:buNone/></a:pPr>` +
    nameRunXml(text, color, fontSz) +
    `<a:endParaRPr b="1" sz="${fontSz}"/></a:p></p:txBody>` +
    `</p:sp>`
  );
}

/**
 * 将名单排成多文本框阵列（一人一框、定位成 grid）。
 * 不用 ppt 表格：LibreOffice 预览常把表格单元格竖排/裁切。
 */
export function buildBirthdayNameGridShapesXml(names: readonly string[]): string {
  const list = names.map((s) => s.trim()).filter(Boolean).slice(0, BIRTHDAY_NAME_MAX);
  const cols = birthdayGridColumns(list.length, list);
  const rowCount = Math.max(1, Math.ceil((list.length || 1) / cols));
  const fontSz = pickBirthdayFontSize(list.length ? list : [' '], cols);
  const colors = ['4C1130', '274E13', '1C4587'];
  const colW = Math.floor(BIRTHDAY_NAMES_BOX.cx / cols);
  const rowH = Math.floor(BIRTHDAY_NAMES_BOX.cy / rowCount);
  const { x, y } = BIRTHDAY_NAMES_BOX;

  const shapes: string[] = [];
  const count = Math.max(list.length, 1);
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const name = list[i] ?? ' ';
    shapes.push(
      nameTextBoxXml(
        i,
        name,
        x + c * colW,
        y + r * rowH,
        colW,
        rowH,
        colors[c % colors.length]!,
        fontSz,
      ),
    );
  }
  return shapes.join('');
}

/** @deprecated 兼容旧名；现为文本框阵列 */
export function buildBirthdayNameGridTableXml(names: readonly string[]): string {
  return buildBirthdayNameGridShapesXml(names);
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

/** 去掉上次写入的额外名字框 / 旧表格 grid */
function stripExtraBirthdayNameArtifacts(xml: string): string {
  let out = xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (sp) => {
    const name = sp.match(/name="([^"]*)"/)?.[1] ?? '';
    if (name.startsWith('Birthday Name ')) {
      // 保留 id=399 主框，留给后面整体替换
      if (sp.includes(`id="${BIRTHDAY_NAMES_SHAPE_ID}"`)) return sp;
      return '';
    }
    return sp;
  });
  out = out.replace(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g, (gf) => {
    if (gf.includes('Birthday Names Grid') || gf.includes(`id="${BIRTHDAY_NAMES_SHAPE_ID}"`)) {
      return '';
    }
    return gf;
  });
  return out;
}

/**
 * 将 P24 名单区替换为横纵向 grid 文本框（不再用单文本框竖排）。
 */
export function applyBirthdayNameGridToSlideXml(xml: string, namesRaw: string): string {
  const names = parseBirthdayNames(namesRaw);
  const grid = buildBirthdayNameGridShapesXml(names);

  let out = stripExtraBirthdayNameArtifacts(xml);
  const block = findShapeBlock(out, BIRTHDAY_NAMES_SHAPE_ID);
  if (block) {
    return out.slice(0, block.start) + grid + out.slice(block.end);
  }

  // 原 shape 已不在：插在页脚「午餐聚會」之前
  const footer = findShapeBlock(out, '401');
  if (footer) {
    return out.slice(0, footer.start) + grid + out.slice(footer.start);
  }
  return out;
}
