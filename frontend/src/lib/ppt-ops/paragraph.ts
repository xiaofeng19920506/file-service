/** 段落级格式：a:pPr 的对齐/行距/项目符号/编号/缩进，以及 a:bodyPr 的文字方向与垂直对齐 */
import { parsePr, rewritePrNodes, serializePr } from './pr';
import { findElementById, replaceElement } from './xml';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type BulletKind = 'none' | 'char' | 'number';
export type TextValign = 'top' | 'middle' | 'bottom';
export type TextDirection = 'horz' | 'vert' | 'vert270';

export type ParagraphPatch = {
  align?: TextAlign;
  /** 倍数行距 */
  lineSpacing?: number;
  bullet?: BulletKind;
  /** 缩进级别增减 */
  levelDelta?: number;
};

/** pPr 子元素的 schema 顺序 */
const PPR_ORDER = [
  'a:lnSpc',
  'a:spcBef',
  'a:spcAft',
  'a:buClrTx',
  'a:buClr',
  'a:buSzTx',
  'a:buSzPct',
  'a:buSzPts',
  'a:buFontTx',
  'a:buFont',
  'a:buNone',
  'a:buAutoNum',
  'a:buChar',
  'a:tabLst',
  'a:defRPr',
  'a:extLst',
];

const ALGN: Record<TextAlign, string> = {
  left: 'l',
  center: 'ctr',
  right: 'r',
  justify: 'just',
};

const ALGN_REVERSE: Record<string, TextAlign> = {
  l: 'left',
  ctr: 'center',
  r: 'right',
  just: 'justify',
  dist: 'justify',
};

const INDENT_STEP_EMU = 457200; // 0.5 英寸
const MAX_LEVEL = 8;

export function patchParaPr(prXml: string, patch: ParagraphPatch): string {
  const pr = parsePr(prXml, 'a:pPr', PPR_ORDER);

  if (patch.align) pr.attrs.set('algn', ALGN[patch.align]);

  if (patch.lineSpacing !== undefined && Number.isFinite(patch.lineSpacing)) {
    const pct = Math.round(Math.max(0.5, Math.min(6, patch.lineSpacing)) * 100000);
    pr.children.set('a:lnSpc', `<a:lnSpc><a:spcPct val="${pct}"/></a:lnSpc>`);
  }

  if (patch.bullet) {
    pr.children.delete('a:buNone');
    pr.children.delete('a:buChar');
    pr.children.delete('a:buAutoNum');
    if (patch.bullet === 'none') {
      pr.children.set('a:buNone', '<a:buNone/>');
    } else if (patch.bullet === 'char') {
      pr.children.set('a:buFont', '<a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/>');
      pr.children.set('a:buChar', '<a:buChar char="•"/>');
    } else {
      pr.children.delete('a:buFont');
      pr.children.set('a:buAutoNum', '<a:buAutoNum type="arabicPeriod"/>');
    }
  }

  if (patch.levelDelta) {
    const current = Number(pr.attrs.get('lvl') ?? '0') || 0;
    const next = Math.max(0, Math.min(MAX_LEVEL, current + patch.levelDelta));
    if (next === 0) pr.attrs.delete('lvl');
    else pr.attrs.set('lvl', String(next));

    const marL = Number(pr.attrs.get('marL') ?? '0') || 0;
    const nextMar = Math.max(0, marL + patch.levelDelta * INDENT_STEP_EMU);
    if (nextMar === 0) pr.attrs.delete('marL');
    else pr.attrs.set('marL', String(nextMar));
  }

  return serializePr(pr, 'a:pPr', PPR_ORDER);
}

/** 对元素内所有段落应用补丁；缺 pPr 的段落补一个 */
export function applyParagraphPatchToElement(
  slideXml: string,
  elementId: number,
  patch: ParagraphPatch,
): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const at = el.xml.indexOf('<p:txBody>');
  const to = el.xml.lastIndexOf('</p:txBody>');
  if (at < 0 || to < 0) return slideXml;
  const bodyEnd = to + '</p:txBody>'.length;

  let body = el.xml.slice(at, bodyEnd);
  body = body.replace(/<a:p>(?!\s*<a:pPr)/g, () => `<a:p>${patchParaPr('<a:pPr/>', patch)}`);
  body = rewritePrNodes(body, 'a:pPr', (prXml) => patchParaPr(prXml, patch));

  const nextEl = el.xml.slice(0, at) + body + el.xml.slice(bodyEnd);
  return replaceElement(slideXml, el, nextEl);
}

const VALIGN: Record<TextValign, string> = { top: 't', middle: 'ctr', bottom: 'b' };
const VALIGN_REVERSE: Record<string, TextValign> = { t: 'top', ctr: 'middle', b: 'bottom' };

function patchBodyPrAttrs(bodyPr: string, attrs: Record<string, string>): string {
  let out = bodyPr;
  for (const [key, value] of Object.entries(attrs)) {
    const re = new RegExp(`\\s${key}="[^"]*"`);
    if (re.test(out)) out = out.replace(re, ` ${key}="${value}"`);
    else out = out.replace(/^<a:bodyPr/, `<a:bodyPr ${key}="${value}"`);
  }
  return out;
}

function applyBodyPr(
  slideXml: string,
  elementId: number,
  attrs: Record<string, string>,
): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  if (!/<a:bodyPr/.test(el.xml)) return slideXml;
  const next = rewritePrNodes(el.xml, 'a:bodyPr', (bodyPr) => patchBodyPrAttrs(bodyPr, attrs));
  return replaceElement(slideXml, el, next);
}

export function setTextValign(slideXml: string, elementId: number, valign: TextValign): string {
  return applyBodyPr(slideXml, elementId, { anchor: VALIGN[valign] });
}

export function setTextDirection(
  slideXml: string,
  elementId: number,
  dir: TextDirection,
): string {
  return applyBodyPr(slideXml, elementId, { vert: dir });
}

/** 读取段落格式，用于 Ribbon 状态回显 */
export function readParagraphFormat(elementXml: string): {
  align?: TextAlign;
  lineSpacing?: number;
  bullet?: BulletKind;
  valign?: TextValign;
  direction?: TextDirection;
  indentLevel?: number;
} {
  const pPr =
    elementXml.match(/<a:pPr(?:"[^"]*"|[^>"])*?\/>/)?.[0] ??
    elementXml.match(/<a:pPr[\s\S]*?<\/a:pPr>/)?.[0] ??
    '';
  const bodyPr =
    elementXml.match(/<a:bodyPr(?:"[^"]*"|[^>"])*?\/>/)?.[0] ??
    elementXml.match(/<a:bodyPr[\s\S]*?<\/a:bodyPr>/)?.[0] ??
    '';

  const algn = pPr.match(/\salgn="([^"]+)"/)?.[1];
  const spcPct = pPr.match(/<a:lnSpc><a:spcPct val="(\d+)"\/>/)?.[1];
  const anchor = bodyPr.match(/\sanchor="([^"]+)"/)?.[1];
  const vert = bodyPr.match(/\svert="([^"]+)"/)?.[1];
  const lvl = pPr.match(/\slvl="(\d+)"/)?.[1];

  const bullet: BulletKind | undefined = pPr.includes('<a:buNone')
    ? 'none'
    : pPr.includes('<a:buAutoNum')
      ? 'number'
      : pPr.includes('<a:buChar')
        ? 'char'
        : undefined;

  return {
    align: algn ? ALGN_REVERSE[algn] : undefined,
    lineSpacing: spcPct ? Number(spcPct) / 100000 : undefined,
    bullet,
    valign: anchor ? VALIGN_REVERSE[anchor] : undefined,
    direction: vert === 'vert' || vert === 'vert270' ? vert : 'horz',
    indentLevel: lvl ? Number(lvl) : 0,
  };
}
