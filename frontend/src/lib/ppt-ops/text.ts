/**
 * 字符级格式：a:rPr 的加粗/倾斜/下划线/删除线/阴影/字号/字色/字体。
 * OOXML 对 a:rPr 的子元素顺序有强要求，这里按 schema 顺序重建。
 */
import { parsePr, rewritePrNodes, serializePr, type ParsedPr } from './pr';
import { escapeXml, findElementById, replaceElement } from './xml';

export type RunPatch = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  shadow?: boolean;
  fontSizePt?: number;
  /** 相对增减字号（pt），与 fontSizePt 互斥 */
  fontSizeDelta?: number;
  /** #RRGGBB */
  color?: string;
  fontFamily?: string;
  /** 清除所有字符格式 */
  clearAll?: boolean;
  hyperlinkRelId?: string;
};

const DEFAULT_FONT_SIZE_PT = 18;
const MIN_FONT_SIZE_PT = 1;
const MAX_FONT_SIZE_PT = 400;

const SHADOW_EFFECT =
  '<a:effectLst><a:outerShdw blurRad="38100" dist="38100" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="43000"/></a:srgbClr></a:outerShdw></a:effectLst>';

/** rPr 子元素的 schema 顺序 */
const RPR_ORDER = [
  'a:ln',
  'a:noFill',
  'a:solidFill',
  'a:gradFill',
  'a:blipFill',
  'a:pattFill',
  'a:grpFill',
  'a:effectLst',
  'a:effectDag',
  'a:highlight',
  'a:uLnTx',
  'a:uLn',
  'a:uFillTx',
  'a:uFill',
  'a:latin',
  'a:ea',
  'a:cs',
  'a:sym',
  'a:hlinkClick',
  'a:hlinkMouseOver',
  'a:rtl',
  'a:extLst',
];

const FILL_TAGS = new Set([
  'a:noFill',
  'a:solidFill',
  'a:gradFill',
  'a:blipFill',
  'a:pattFill',
  'a:grpFill',
]);

function setFill(pr: ParsedPr, hex: string): void {
  for (const tag of FILL_TAGS) pr.children.delete(tag);
  pr.children.set('a:solidFill', `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`);
}

function normalizeHex(color: string): string {
  return color.replace('#', '').toUpperCase().slice(0, 6);
}

/** 对单个 rPr（或 endParaRPr / defRPr）应用格式补丁 */
export function patchRunPr(prXml: string, tagName: string, patch: RunPatch): string {
  const pr = parsePr(prXml, tagName, RPR_ORDER);

  if (patch.clearAll) {
    const lang = pr.attrs.get('lang');
    pr.attrs.clear();
    if (lang) pr.attrs.set('lang', lang);
    pr.children.clear();
    pr.extra.length = 0;
    return serializePr(pr, tagName, RPR_ORDER);
  }

  if (patch.bold !== undefined) pr.attrs.set('b', patch.bold ? '1' : '0');
  if (patch.italic !== undefined) pr.attrs.set('i', patch.italic ? '1' : '0');
  if (patch.underline !== undefined) pr.attrs.set('u', patch.underline ? 'sng' : 'none');
  if (patch.strike !== undefined) {
    pr.attrs.set('strike', patch.strike ? 'sngStrike' : 'noStrike');
  }

  if (patch.fontSizePt !== undefined && Number.isFinite(patch.fontSizePt)) {
    const clamped = Math.min(MAX_FONT_SIZE_PT, Math.max(MIN_FONT_SIZE_PT, patch.fontSizePt));
    pr.attrs.set('sz', String(Math.round(clamped * 100)));
  } else if (patch.fontSizeDelta !== undefined) {
    const current = Number(pr.attrs.get('sz')) / 100 || DEFAULT_FONT_SIZE_PT;
    const next = Math.min(MAX_FONT_SIZE_PT, Math.max(MIN_FONT_SIZE_PT, current + patch.fontSizeDelta));
    pr.attrs.set('sz', String(Math.round(next * 100)));
  }

  if (patch.shadow !== undefined) {
    if (patch.shadow) pr.children.set('a:effectLst', SHADOW_EFFECT);
    else pr.children.delete('a:effectLst');
  }

  if (patch.color) setFill(pr, normalizeHex(patch.color));

  if (patch.fontFamily?.trim()) {
    const face = escapeXml(patch.fontFamily.trim());
    pr.children.set('a:latin', `<a:latin typeface="${face}"/>`);
    pr.children.set('a:ea', `<a:ea typeface="${face}"/>`);
    pr.children.set('a:cs', `<a:cs typeface="${face}"/>`);
  }

  if (patch.hyperlinkRelId) {
    pr.children.set(
      'a:hlinkClick',
      `<a:hlinkClick xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${patch.hyperlinkRelId}"/>`,
    );
  }

  return serializePr(pr, tagName, RPR_ORDER);
}

/**
 * 匹配 <a:t> 文本节点。不能写成 `<a:t[^>]*>`：那会把 <a:tailEnd .../>、<a:tab/> 之类
 * 同前缀的标签也当成文本开标签，后续替换会吞掉整段 XML。
 */
const A_TEXT_OPEN = '<a:t(?:\\s(?:"[^"]*"|[^>"/])*)?>';

/** 每次新建，避免共享 g 标记的 lastIndex */
export function aTextRegex(): RegExp {
  return new RegExp(`(${A_TEXT_OPEN})([\\s\\S]*?)(<\\/a:t>)`, 'g');
}

const PR_TAGS = ['a:rPr', 'a:endParaRPr', 'a:defRPr'] as const;

/** 对一段 xml 里所有字符属性节点应用补丁；缺失时按需补上 */
export function patchAllRunPr(xml: string, patch: RunPatch): string {
  let out = xml;

  for (const tag of PR_TAGS) {
    out = rewritePrNodes(out, tag, (prXml) => patchRunPr(prXml, tag, patch));
  }

  // 没有 rPr 的 run 补一个，保证格式落地
  out = out.replace(/<a:r>(\s*)(?=<a:t[\s>])/g, (_full, ws: string) => {
    const pr = patchRunPr('<a:rPr lang="zh-CN"/>', 'a:rPr', patch);
    return `<a:r>${pr}${ws}`;
  });

  return out;
}

/** 对指定元素内的所有文字应用字符格式 */
export function applyRunPatchToElement(
  slideXml: string,
  elementId: number,
  patch: RunPatch,
): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const at = el.xml.indexOf('<p:txBody>');
  const to = el.xml.lastIndexOf('</p:txBody>');
  if (at < 0 || to < 0) return slideXml;
  const bodyEnd = to + '</p:txBody>'.length;
  const nextBody = patchAllRunPr(el.xml.slice(at, bodyEnd), patch);
  const nextEl = el.xml.slice(0, at) + nextBody + el.xml.slice(bodyEnd);
  return replaceElement(slideXml, el, nextEl);
}

type CharRunSpan = {
  /** run 在元素 xml 中的绝对起止（相对 el.xml） */
  start: number;
  end: number;
  textStart: number;
  textEnd: number;
  rPr: string;
  text: string;
  runInnerStart: number;
};

function listCharRuns(elementXml: string): CharRunSpan[] {
  const bodyAt = elementXml.indexOf('<p:txBody>');
  const bodyTo = elementXml.lastIndexOf('</p:txBody>');
  if (bodyAt < 0 || bodyTo < 0) return [];
  const body = elementXml.slice(bodyAt, bodyTo);
  const runs: CharRunSpan[] = [];
  let absOffset = 0;
  let searchFrom = 0;

  const paraRe = /<a:p>([\s\S]*?)<\/a:p>/g;
  let para: RegExpExecArray | null;
  let paraIndex = 0;
  while ((para = paraRe.exec(body)) !== null) {
    if (paraIndex > 0) absOffset += 1; // 段落之间的 \n
    const paraInner = para[1];
    const paraAbsStart = bodyAt + para.index + '<a:p>'.length;
    const runRe = /<a:r>([\s\S]*?)<\/a:r>/g;
    let run: RegExpExecArray | null;
    while ((run = runRe.exec(paraInner)) !== null) {
      const inner = run[1];
      const rPr =
        inner.match(/<a:rPr\b[^>]*\/>/)?.[0] ??
        inner.match(/<a:rPr\b[\s\S]*?<\/a:rPr>/)?.[0] ??
        '<a:rPr lang="zh-CN"/>';
      const tMatch = inner.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
      const text = tMatch ? unescapeXml(tMatch[1]) : '';
      const runStart = paraAbsStart + run.index;
      const runEnd = runStart + run[0].length;
      runs.push({
        start: runStart,
        end: runEnd,
        textStart: absOffset,
        textEnd: absOffset + text.length,
        rPr,
        text,
        runInnerStart: runStart + '<a:r>'.length,
      });
      absOffset += text.length;
    }
    paraIndex += 1;
    searchFrom = paraRe.lastIndex;
  }
  void searchFrom;
  return runs;
}

function serializeRun(rPr: string, text: string): string {
  const tTag =
    text === ''
      ? `<a:t xml:space="preserve"></a:t>`
      : /^\s|\s$/.test(text)
        ? `<a:t xml:space="preserve">${escapeXml(text)}</a:t>`
        : `<a:t>${escapeXml(text)}</a:t>`;
  return `<a:r>${rPr}${tTag}</a:r>`;
}

/**
 * 对元素内 [start, end) 字符区间（段落间以 \\n 计）应用格式。
 * 会在边界处拆分 run，只改选中部分的颜色/字号等。
 */
export function applyRunPatchToCharRange(
  slideXml: string,
  elementId: number,
  start: number,
  end: number,
  patch: RunPatch,
): string {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return applyRunPatchToElement(slideXml, elementId, patch);
  }
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;

  const runs = listCharRuns(el.xml);
  if (!runs.length) return applyRunPatchToElement(slideXml, elementId, patch);

  // 从后往前替换，避免下标错位
  let nextXml = el.xml;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    const overlapStart = Math.max(run.textStart, start);
    const overlapEnd = Math.min(run.textEnd, end);
    if (overlapEnd <= overlapStart) continue;

    const localStart = overlapStart - run.textStart;
    const localEnd = overlapEnd - run.textStart;
    const before = run.text.slice(0, localStart);
    const mid = run.text.slice(localStart, localEnd);
    const after = run.text.slice(localEnd);
    const midPr = patchRunPr(run.rPr, 'a:rPr', patch);

    const parts: string[] = [];
    if (before) parts.push(serializeRun(run.rPr, before));
    if (mid || (!before && !after)) parts.push(serializeRun(midPr, mid));
    if (after) parts.push(serializeRun(run.rPr, after));

    nextXml = nextXml.slice(0, run.start) + parts.join('') + nextXml.slice(run.end);
  }

  return replaceElement(slideXml, el, nextXml);
}

/** 光标落在某个 run 内时，返回该 run 的字符区间（用于未拖选时改当前片段） */
export function charRangeForCaret(
  elementXml: string,
  caret: number,
): { start: number; end: number } | null {
  const runs = listCharRuns(elementXml);
  if (!runs.length) return null;
  const hit =
    runs.find((r) => caret >= r.textStart && caret < r.textEnd) ??
    runs.find((r) => caret === r.textEnd && r.textEnd > r.textStart) ??
    runs[runs.length - 1];
  if (!hit || hit.textEnd <= hit.textStart) return null;
  return { start: hit.textStart, end: hit.textEnd };
}

/** 读取元素内指定字符区间第一个 run 的格式；无区间则读首个 run */
export function readRunFormatInRange(
  elementXml: string,
  start?: number,
  end?: number,
): ReturnType<typeof readRunFormat> {
  if (start == null || end == null || end <= start) {
    return readRunFormat(elementXml);
  }
  const runs = listCharRuns(elementXml);
  const hit = runs.find((r) => r.textEnd > start && r.textStart < end);
  if (!hit) return readRunFormat(elementXml);
  // 构造最小片段供 readRunFormat 解析
  return readRunFormat(`<a:r>${hit.rPr}<a:t>x</a:t></a:r>`);
}

/** 读取元素内第一个 run 的字符格式，用于 Ribbon 状态回显 */
export function readRunFormat(elementXml: string): {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  shadow?: boolean;
  fontSizePt?: number;
  color?: string;
  fontFamily?: string;
} {
  const rPr =
    elementXml.match(/<a:r>\s*(<a:rPr\b[^>]*\/>)/)?.[1] ??
    elementXml.match(/<a:r>\s*(<a:rPr[\s\S]*?<\/a:rPr>)/)?.[1] ??
    '';
  const attrs = rPr.match(/^<a:rPr((?:"[^"]*"|[^>"])*?)\/?>/)?.[1] ?? '';
  const sz = attrs.match(/\ssz="(\d+)"/)?.[1];
  const color = rPr.match(/<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1];
  const face =
    rPr.match(/<a:ea typeface="([^"]*)"/)?.[1] ?? rPr.match(/<a:latin typeface="([^"]*)"/)?.[1];

  return {
    bold: /\sb="1"/.test(attrs),
    italic: /\si="1"/.test(attrs),
    underline: /\su="(?!none)[^"]+"/.test(attrs),
    strike: /\sstrike="sngStrike"/.test(attrs),
    shadow: rPr.includes('<a:outerShdw'),
    fontSizePt: sz ? Number(sz) / 100 : undefined,
    color: color ? `#${color.toUpperCase()}` : undefined,
    fontFamily: face && !face.startsWith('+') ? face : undefined,
  };
}

export type CaseAction = 'upper' | 'lower' | 'sentence' | 'capitalize' | 'toggle';

function transformCase(text: string, action: CaseAction): string {
  switch (action) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(/\p{L}[\p{L}'’]*/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    case 'sentence':
      return text
        .toLowerCase()
        .replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
    case 'toggle':
      return [...text]
        .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
        .join('');
    default:
      return text;
  }
}

/** 对元素内所有 a:t 文本做映射（大小写切换、查找替换） */
export function mapElementText(
  slideXml: string,
  elementId: number,
  fn: (text: string) => string,
): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const next = el.xml.replace(
    aTextRegex(),
    (_full, open: string, body: string, close: string) =>
      `${open}${escapeXml(fn(unescapeXml(body)))}${close}`,
  );
  return replaceElement(slideXml, el, next);
}

export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function changeElementCase(
  slideXml: string,
  elementId: number,
  action: CaseAction,
): string {
  return mapElementText(slideXml, elementId, (t) => transformCase(t, action));
}

/** 整页查找替换（返回新 xml 与替换次数） */
export function replaceAllText(
  slideXml: string,
  search: string,
  replacement: string,
  matchCase = false,
): { xml: string; count: number } {
  if (!search) return { xml: slideXml, count: 0 };
  let count = 0;
  const needle = matchCase ? search : search.toLowerCase();

  const xml = slideXml.replace(
    aTextRegex(),
    (_full, open: string, body: string, close: string) => {
      const raw = unescapeXml(body);
      const haystack = matchCase ? raw : raw.toLowerCase();
      if (!haystack.includes(needle)) return `${open}${body}${close}`;
      let result = '';
      let i = 0;
      while (i < raw.length) {
        const at = haystack.indexOf(needle, i);
        if (at < 0) {
          result += raw.slice(i);
          break;
        }
        result += raw.slice(i, at) + replacement;
        i = at + search.length;
        count += 1;
      }
      return `${open}${escapeXml(result)}${close}`;
    },
  );

  return { xml, count };
}

/** 统计整页匹配数 */
export function countText(slideXml: string, search: string, matchCase = false): number {
  if (!search) return 0;
  const needle = matchCase ? search : search.toLowerCase();
  let count = 0;
  for (const m of slideXml.matchAll(aTextRegex())) {
    const raw = matchCase ? unescapeXml(m[2]) : unescapeXml(m[2]).toLowerCase();
    let i = 0;
    while (true) {
      const at = raw.indexOf(needle, i);
      if (at < 0) break;
      count += 1;
      i = at + needle.length;
    }
  }
  return count;
}
