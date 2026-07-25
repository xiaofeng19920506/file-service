/**
 * slideN.xml 操作的公共底座：定位 spTree 内的元素、读写 xfrm、生成 id。
 * 全部是纯字符串函数，便于组合与单测。
 */

export const EMU_PER_INCH = 914400;
export const EMU_PER_PT = 12700;

export type ElementTag = 'sp' | 'pic' | 'graphicFrame' | 'grpSp' | 'cxnSp';

export type SlideElement = {
  tag: ElementTag;
  /** cNvPr id */
  id: number | null;
  name: string;
  /** 在整份 xml 中的起止下标 */
  start: number;
  end: number;
  xml: string;
};

export type BoxEmu = { x: number; y: number; cx: number; cy: number };

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 找到与 openStart 处开标签配对的结束位置（支持同名嵌套） */
function matchEnd(xml: string, tag: string, openStart: number): number {
  const openRe = new RegExp(`<p:${tag}(?=[\\s>])`, 'g');
  const closeTag = `</p:${tag}>`;
  let depth = 0;
  let i = openStart;

  while (i < xml.length) {
    openRe.lastIndex = i;
    const open = openRe.exec(xml);
    const close = xml.indexOf(closeTag, i);
    if (close < 0) return -1;
    if (open && open.index < close) {
      depth += 1;
      i = open.index + 1;
    } else {
      depth -= 1;
      if (depth <= 0) return close + closeTag.length;
      i = close + closeTag.length;
    }
  }
  return -1;
}

export function spTreeRange(xml: string): { start: number; end: number } | null {
  const open = xml.match(/<p:spTree>/);
  if (!open || open.index == null) return null;
  const start = open.index + open[0].length;
  const end = xml.indexOf('</p:spTree>', start);
  if (end < 0) return null;
  return { start, end };
}

function readId(chunk: string): number | null {
  const raw = chunk.match(/<p:cNvPr[^>]*\sid="(\d+)"/)?.[1];
  return raw ? Number(raw) : null;
}

function readName(chunk: string): string {
  return chunk.match(/<p:cNvPr[^>]*\sname="([^"]*)"/)?.[1] ?? '';
}

/** spTree 的直接子元素，按层叠顺序（先绘制在底层） */
export function listElements(xml: string): SlideElement[] {
  const range = spTreeRange(xml);
  if (!range) return [];
  const out: SlideElement[] = [];
  const re = /<p:(sp|pic|graphicFrame|grpSp|cxnSp)(?=[\s>])/g;
  let cursor = range.start;

  while (cursor < range.end) {
    re.lastIndex = cursor;
    const m = re.exec(xml);
    if (!m || m.index >= range.end) break;
    const end = matchEnd(xml, m[1], m.index);
    if (end < 0) break;
    const chunk = xml.slice(m.index, end);
    out.push({
      tag: m[1] as ElementTag,
      id: readId(chunk),
      name: readName(chunk),
      start: m.index,
      end,
      xml: chunk,
    });
    cursor = end;
  }
  return out;
}

/** 按 cNvPr id 定位元素（组内嵌套也能命中） */
export function findElementById(xml: string, id: number): SlideElement | null {
  const marker = new RegExp(`<p:cNvPr[^>]*\\sid="${id}"[\\s\\S]*?>`).exec(xml);
  if (!marker || marker.index == null) return null;

  const before = xml.slice(0, marker.index);
  const openRe = /<p:(sp|pic|graphicFrame|grpSp|cxnSp)(?=[\s>])/g;
  let openIndex = -1;
  let tag: ElementTag | null = null;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(before))) {
    openIndex = m.index;
    tag = m[1] as ElementTag;
  }
  if (openIndex < 0 || !tag) return null;

  const end = matchEnd(xml, tag, openIndex);
  if (end < 0) return null;
  const chunk = xml.slice(openIndex, end);
  return { tag, id, name: readName(chunk), start: openIndex, end, xml: chunk };
}

export function replaceElement(xml: string, el: SlideElement, next: string): string {
  return xml.slice(0, el.start) + next + xml.slice(el.end);
}

export function removeElement(xml: string, el: SlideElement): string {
  return xml.slice(0, el.start) + xml.slice(el.end);
}

/** 追加到 spTree 末尾（层叠最上层） */
export function appendElement(xml: string, elementXml: string): string {
  const range = spTreeRange(xml);
  if (!range) return xml;
  return xml.slice(0, range.end) + elementXml + xml.slice(range.end);
}

/** 插到 spTree 最前（层叠最底层） */
export function prependElement(xml: string, elementXml: string): string {
  const range = spTreeRange(xml);
  if (!range) return xml;
  return xml.slice(0, range.start) + elementXml + xml.slice(range.start);
}

export function nextElementId(xml: string): number {
  const ids = [...xml.matchAll(/<p:cNvPr[^>]*\sid="(\d+)"/g)].map((m) => Number(m[1]));
  return (ids.length ? Math.max(...ids) : 1) + 1;
}

// 属性顺序不固定（不同生成器写 x/y、y/x 都有），按标签取再单独抠属性
const OFF_RE = /<a:off(\s(?:"[^"]*"|[^>"])*?)\/>/;
const EXT_RE = /<a:ext(\s(?:"[^"]*"|[^>"])*?)\/>/;

function attrNum(attrs: string, name: string): number | null {
  const raw = attrs.match(new RegExp(`\\s${name}="(-?\\d+)"`))?.[1];
  return raw == null ? null : Number(raw);
}

/** 读取元素几何（EMU） */
export function readBox(elementXml: string): BoxEmu | null {
  const off = elementXml.match(OFF_RE);
  const ext = elementXml.match(EXT_RE);
  if (!off || !ext) return null;
  const x = attrNum(off[1], 'x');
  const y = attrNum(off[1], 'y');
  const cx = attrNum(ext[1], 'cx');
  const cy = attrNum(ext[1], 'cy');
  if (x == null || y == null || cx == null || cy == null) return null;
  return { x, y, cx, cy };
}

/** 写入元素几何（EMU），没有 xfrm 时补一个 */
export function writeBox(elementXml: string, box: BoxEmu): string {
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const cx = Math.max(1, Math.round(box.cx));
  const cy = Math.max(1, Math.round(box.cy));

  if (OFF_RE.test(elementXml)) {
    return elementXml
      .replace(OFF_RE, `<a:off x="${x}" y="${y}"/>`)
      .replace(EXT_RE, `<a:ext cx="${cx}" cy="${cy}"/>`);
  }

  const xfrm = `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
  if (/<p:spPr\s*\/>/.test(elementXml)) {
    return elementXml.replace(/<p:spPr\s*\/>/, `<p:spPr>${xfrm}</p:spPr>`);
  }
  if (/<p:spPr[^>]*>/.test(elementXml)) {
    return elementXml.replace(/(<p:spPr[^>]*>)/, `$1${xfrm}`);
  }
  return elementXml;
}

export type SlideSize = { cx: number; cy: number };

export const DEFAULT_SLIDE_SIZE: SlideSize = { cx: 12192000, cy: 6858000 };

export function pctToEmu(pct: number, total: number): number {
  return Math.round((pct / 100) * total);
}

export function emuToPct(emu: number, total: number): number {
  return (emu / total) * 100;
}

/**
 * 读取 presentation 幻灯片尺寸；读不到时兜底 16:9。
 * sldSz 的属性顺序不固定（Google Slides 导出会写成 cy 在前），
 * 必须逐属性抠，否则会静默回退到默认尺寸，导致画布百分比与写回 EMU 不同基准。
 */
export function slideSizeFromXml(
  presentationXml: string | null | undefined,
  fallback: SlideSize = DEFAULT_SLIDE_SIZE,
): SlideSize {
  const tag = presentationXml?.match(/<p:sldSz\b[^>]*>/)?.[0];
  if (!tag) return { ...fallback };
  const cx = attrNum(tag, 'cx');
  const cy = attrNum(tag, 'cy');
  if (!cx || cx <= 0 || !cy || cy <= 0) return { ...fallback };
  return { cx, cy };
}
