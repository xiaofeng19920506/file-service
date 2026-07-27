import type JSZip from 'jszip';
import { slideSizeFromXml } from './ppt-ops/xml';

export type SlideSizeEmu = { cx: number; cy: number };

/** 标准宽屏幻灯片（10" × 5.625"，16:9） */
export const DEFAULT_SLIDE_SIZE: SlideSizeEmu = { cx: 9144000, cy: 5143500 };

const FALLBACK_SCHEME: Record<string, string> = {
  accent6: '#F8E71C',
  lt2: '#BFC7CA',
  dk1: '#FFFFFF',
  dk2: '#1E2D31',
  bg1: '#FFFFFF',
  tx1: '#1E2D31',
};

export type SlideTextRun = {
  text: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  fontSizePt?: number;
  fontFamily?: string;
};

export type SlideTextParagraph = {
  runs: SlideTextRun[];
  align: 'left' | 'center' | 'right';
  lineSpacing: number;
  /** 空段落，用于红/蓝区之间的行距 */
  spacer?: boolean;
  spacerHeightPt?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
};

export type SlideVisualLayer =
  | {
      kind: 'background';
      url: string;
    }
  | {
      kind: 'image';
      url: string;
      /** OOXML cNvPr id，用于选中与几何编辑 */
      elementId?: number;
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | {
      kind: 'shape';
      /** 带文字的形状序号（仅有 txBody 且计入编辑的形状）；纯色块无 undefined */
      shapeIndex?: number;
      /** OOXML cNvPr id，用于选中与几何编辑 */
      elementId?: number;
      fill?: string;
      line?: string;
      paragraphs: SlideTextParagraph[];
      left: number;
      top: number;
      width: number;
      height: number;
      valign?: 'top' | 'middle' | 'bottom';
      autoFit?: boolean;
      paddingPct?: { top: number; right: number; bottom: number; left: number };
    }
  | {
      kind: 'table';
      elementId?: number;
      rows: { cells: { text: string; bold?: boolean }[] }[];
      left: number;
      top: number;
      width: number;
      height: number;
    };

function emuPct(value: number, total: number): number {
  return (value / total) * 100;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function loadThemeSchemeColors(zip: JSZip): Promise<Record<string, string>> {
  const themePath = Object.keys(zip.files).find((n) => /^ppt\/theme\/theme\d+\.xml$/.test(n));
  const entry = themePath ? zip.file(themePath) : zip.file('ppt/theme/theme1.xml');
  if (!entry) return { ...FALLBACK_SCHEME };

  const xml = await entry.async('string');
  const colors: Record<string, string> = { ...FALLBACK_SCHEME };
  const names = [
    'dk1', 'lt1', 'dk2', 'lt2',
    'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
    'hlink', 'folHlink', 'bg1', 'bg2', 'tx1', 'tx2',
  ];

  for (const name of names) {
    const block = xml.match(new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`))?.[1];
    if (!block) continue;
    const rgb = block.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1];
    if (rgb) {
      colors[name] = `#${rgb}`;
      continue;
    }
    const lastClr = block.match(/lastClr="([0-9A-Fa-f]{6})"/)?.[1];
    if (lastClr) colors[name] = `#${lastClr}`;
  }
  return colors;
}

/**
 * 无 solidFill 的 run 该用什么颜色：OOXML 里由 presentation.xml 的
 * defaultTextStyle（文本框）/ 母版 otherStyle 决定，兜底黑色。
 * 不能退回 theme 的 tx1/dk2——本模板 clrMap 把 tx1 映射到白色 dk1，
 * 直接取会让封面日期、底部提示语变色，与 LibreOffice 预览不一致。
 */
async function loadDefaultTextColor(
  zip: JSZip,
  schemeColors: Record<string, string>,
): Promise<string> {
  const sources: (string | undefined)[] = [];
  const pres = zip.file('ppt/presentation.xml');
  if (pres) {
    const xml = await pres.async('string');
    sources.push(xml.match(/<p:defaultTextStyle>[\s\S]*?<\/p:defaultTextStyle>/)?.[0]);
  }
  const masterPath = Object.keys(zip.files).find((n) =>
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n),
  );
  const master = masterPath ? zip.file(masterPath) : null;
  if (master) {
    const xml = await master.async('string');
    sources.push(xml.match(/<p:otherStyle>[\s\S]*?<\/p:otherStyle>/)?.[0]);
  }

  for (const source of sources) {
    const defRPr = source?.match(/<a:lvl1pPr[\s\S]*?<a:defRPr[\s\S]*?<\/a:defRPr>/)?.[0];
    if (!defRPr) continue;
    const fill = defRPr.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)?.[1];
    if (!fill) continue;
    const rgb = fill.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1];
    if (rgb) return `#${rgb}`;
    const scheme = fill.match(/<a:schemeClr val="([^"]+)"/)?.[1];
    const resolved = scheme ? resolveSchemeColor(schemeColors, scheme) : null;
    if (resolved) return resolved;
  }
  return '#000000';
}

function extractShapeBoxEmu(chunk: string): {
  left: number;
  top: number;
  width: number;
  height: number;
  widthEmu: number;
  heightEmu: number;
} | null {
  const spPr = chunk.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1] ?? chunk;
  // 属性顺序不固定，且拖到画布外时 x/y 可以是负数
  const off = spPr.match(/<a:off\s[^>]*\/>/)?.[0];
  const ext = spPr.match(/<a:ext\s[^>]*\/>/)?.[0];
  if (!off || !ext) return null;
  const attr = (xml: string, name: string) => {
    const raw = xml.match(new RegExp(`\\s${name}="(-?\\d+)"`))?.[1];
    return raw == null ? null : Number(raw);
  };
  const left = attr(off, 'x');
  const top = attr(off, 'y');
  const widthEmu = attr(ext, 'cx');
  const heightEmu = attr(ext, 'cy');
  if (left == null || top == null || widthEmu == null || heightEmu == null) return null;
  return {
    left,
    top,
    width: widthEmu,
    height: heightEmu,
    widthEmu,
    heightEmu,
  };
}

function extractShapeBox(
  xml: string,
  slideSize: SlideSizeEmu,
): { left: number; top: number; width: number; height: number; widthEmu: number; heightEmu: number } | null {
  const raw = extractShapeBoxEmu(xml);
  if (!raw) return null;
  return {
    left: emuPct(raw.left, slideSize.cx),
    top: emuPct(raw.top, slideSize.cy),
    width: emuPct(raw.width, slideSize.cx),
    height: emuPct(raw.height, slideSize.cy),
    widthEmu: raw.widthEmu,
    heightEmu: raw.heightEmu,
  };
}

/**
 * 文本框内边距（EMU）折算成「幻灯片宽度的百分比」。CSS 里 padding 的百分比一律按
 * 包含块的宽度解析，所以四边都用 slideCx 换算才能得到与 EMU 等比的实际间距；
 * 换成形状自身尺寸或容器查询单位都会算错（形状本身就是 size container，自引用）。
 */
function extractTextBoxPadding(
  txBody: string,
  slideCx: number,
): { top: number; right: number; bottom: number; left: number } {
  const bodyPr = txBody.match(/<a:bodyPr([^/]*)\/>/)?.[1] ?? txBody.match(/<a:bodyPr([^>]*)>/)?.[1] ?? '';
  const read = (attr: string) => {
    const m = bodyPr.match(new RegExp(`${attr}="(\\d+)"`));
    return m && slideCx > 0 ? (Number(m[1]) / slideCx) * 100 : 0;
  };
  return {
    top: read('tIns'),
    right: read('rIns'),
    bottom: read('bIns'),
    left: read('lIns'),
  };
}

/** 从 `ppt/presentation.xml` 读取幻灯片宽高（EMU） */
export async function loadSlideSizeEmu(zip: JSZip): Promise<SlideSizeEmu> {
  const entry = zip.file('ppt/presentation.xml');
  if (!entry) return { ...DEFAULT_SLIDE_SIZE };
  return slideSizeFromXml(await entry.async('string'), DEFAULT_SLIDE_SIZE);
}

function resolveSchemeColor(schemeColors: Record<string, string>, schemeName: string): string | null {
  return schemeColors[schemeName] ?? FALLBACK_SCHEME[schemeName] ?? null;
}

function extractShapeFillColor(chunk: string, schemeColors: Record<string, string>): string | null {
  const spPr = chunk.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1];
  if (!spPr || !spPr.includes('<a:solidFill>')) return null;

  const rgb = spPr.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (rgb) return `#${rgb[1]}`;

  const scheme = spPr.match(/<a:solidFill>[\s\S]*?<a:schemeClr val="([^"]+)"/);
  if (scheme) return resolveSchemeColor(schemeColors, scheme[1]);

  return null;
}

function extractShapeLineColor(chunk: string, schemeColors: Record<string, string>): string | null {
  const spPr = chunk.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1];
  const ln = spPr?.match(/<a:ln[^>]*>([\s\S]*?)<\/a:ln>/)?.[1];
  if (!ln || ln.includes('<a:noFill/>')) return null;

  const rgb = ln.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (rgb) return `#${rgb[1]}`;

  const scheme = ln.match(/<a:schemeClr val="([^"]+)"/);
  if (scheme) return resolveSchemeColor(schemeColors, scheme[1]);

  return null;
}

function extractRunStyle(
  rPrXml: string,
  schemeColors: Record<string, string>,
  defaultColor: string,
): Omit<SlideTextRun, 'text'> {
  let color: string | undefined;
  const rgb = rPrXml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (rgb) color = `#${rgb[1]}`;
  const scheme = rPrXml.match(/<a:schemeClr val="([^"]+)"/);
  if (scheme) color = resolveSchemeColor(schemeColors, scheme[1]) ?? color;
  const sz = rPrXml.match(/sz="(\d+)"/);
  const fontSizePt = sz ? Number(sz[1]) / 100 : undefined;
  const bold = /\sb="1"/.test(rPrXml);
  const italic = /\si="1"/.test(rPrXml);
  const ea = rPrXml.match(/<a:ea typeface="([^"]+)"/)?.[1];
  const latin = rPrXml.match(/<a:latin typeface="([^"]+)"/)?.[1];
  const fontFamily = ea || latin;
  return {
    color: color ?? defaultColor,
    bold,
    italic,
    fontSizePt,
    fontFamily,
  };
}

function extractTextContent(
  xml: string,
  schemeColors: Record<string, string>,
  defaultColor: string,
): {
  paragraphs: SlideTextParagraph[];
  valign: 'top' | 'middle' | 'bottom';
  autoFit: boolean;
} {
  const txBody = xml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1] ?? '';
  const bodyPr = txBody.match(/<a:bodyPr([^/]*)\/>/)?.[1] ?? txBody.match(/<a:bodyPr([^>]*)>/)?.[1] ?? '';
  const autoFit = /<a:spAutoFit\s*\/?>/.test(txBody);
  let valign: 'top' | 'middle' | 'bottom' = 'top';
  if (bodyPr.includes('anchor="ctr"')) valign = 'middle';
  else if (bodyPr.includes('anchor="b"')) valign = 'bottom';

  const paragraphs: SlideTextParagraph[] = [];
  const paragraphMatches = [...txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)];

  for (const p of paragraphMatches) {
    const pXml = p[1];
    let align: 'left' | 'center' | 'right' = 'left';
    const algn = pXml.match(/<a:pPr[^>]*algn="([^"]+)"/)?.[1];
    if (algn === 'ctr') align = 'center';
    else if (algn === 'r') align = 'right';

    const lnSpc = pXml.match(/<a:lnSpc>[\s\S]*?<a:spcPct val="(\d+)"/)?.[1];
    const lineSpacingRaw = lnSpc ? Number(lnSpc) / 100_000 : 1;
    // PPT 常写 0.7 等紧行距；CSS 按此裁切 CJK 字形。下限避免编辑器里残缺，仍保留偏紧观感。
    const lineSpacing = Math.max(0.9, lineSpacingRaw || 1);

    const spcBefPts = pXml.match(/<a:spcBef>[\s\S]*?<a:spcPts val="(\d+)"/)?.[1];
    const spcAftPts = pXml.match(/<a:spcAft>[\s\S]*?<a:spcPts val="(\d+)"/)?.[1];
    const spaceBeforePt = spcBefPts ? Number(spcBefPts) / 100 : undefined;
    const spaceAfterPt = spcAftPts ? Number(spcAftPts) / 100 : undefined;

    const runs: SlideTextRun[] = [];
    for (const run of pXml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
      const rXml = run[1];
      const t = rXml.match(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/)?.[2];
      if (t === undefined) continue;
      const text = decodeXmlEntities(t);
      if (!text && !/\s/.test(t)) continue;
      const rPrXml =
        rXml.match(/<a:rPr[^>]*>[\s\S]*?<\/a:rPr>/)?.[0]
        ?? rXml.match(/<a:rPr[^>]*\/>/)?.[0]
        ?? '<a:rPr/>';
      runs.push({ text, ...extractRunStyle(rPrXml, schemeColors, defaultColor) });
    }

    if (runs.length) {
      paragraphs.push({
        runs,
        align,
        lineSpacing,
        spaceBeforePt,
        spaceAfterPt,
      });
    } else if (/<a:r>[\s\S]*?<a:t[^>]*>\s*<\/a:t>/.test(pXml)) {
      const endSz = pXml.match(/<a:endParaRPr[^>]*sz="(\d+)"/)?.[1];
      const fontSizePt = endSz ? Number(endSz) / 100 : 14;
      paragraphs.push({
        runs: [],
        align,
        lineSpacing,
        spacer: true,
        spacerHeightPt: fontSizePt * (lineSpacing || 1),
      });
    }
  }

  return { paragraphs: trimEdgeBlankParagraphs(paragraphs), valign, autoFit };
}

/** 去掉文本框首尾的空行/spacer（Google 导出常用来垫高）；保留夹在正文中间的间距 */
export function trimEdgeBlankParagraphs(paragraphs: SlideTextParagraph[]): SlideTextParagraph[] {
  if (paragraphs.length <= 1) return paragraphs;

  const isBlank = (p: SlideTextParagraph): boolean => {
    if (p.spacer) return true;
    if (!p.runs.length) return true;
    return p.runs.every((r) => !r.text.trim());
  };

  let start = 0;
  while (start < paragraphs.length && isBlank(paragraphs[start]!)) start += 1;
  let end = paragraphs.length;
  while (end > start && isBlank(paragraphs[end - 1]!)) end -= 1;
  return paragraphs.slice(start, end);
}

async function resolveMediaPath(zip: JSZip, slidePath: string, rId: string): Promise<string | null> {
  const relPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
  const relEntry = zip.file(relPath);
  if (!relEntry) return null;
  const relXml = await relEntry.async('string');
  const target = relXml.match(new RegExp(`Id="${rId}"[^>]+Target="([^"]+)"`))?.[1];
  if (!target) return null;
  const baseDir = slidePath.slice(0, slidePath.lastIndexOf('/'));
  const parts = baseDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function mediaToUrl(zip: JSZip, mediaPath: string): Promise<string | null> {
  const entry = zip.file(mediaPath);
  if (!entry) return null;
  const blob = await entry.async('blob');
  return URL.createObjectURL(blob);
}

export function autoFitScale(
  layer: Extract<SlideVisualLayer, { kind: 'shape' }>,
  slideCy: number = DEFAULT_SLIDE_SIZE.cy,
): number {
  if (!layer.autoFit || !layer.paragraphs.length) return 1;
  const slideHeightPt = (slideCy / 914400) * 72;
  const boxHeightPt = (layer.height / 100) * slideHeightPt;
  let contentPt = 0;
  for (const p of layer.paragraphs) {
    const maxPt = Math.max(...p.runs.map((r) => r.fontSizePt ?? 14), 14);
    contentPt += maxPt * (p.lineSpacing || 1);
  }
  if (contentPt <= 0) return 1;
  return Math.min(1, (boxHeightPt / contentPt) * 0.92);
}

export type ParsedSlideVisual = {
  layers: SlideVisualLayer[];
  slideSize: SlideSizeEmu;
};

/** 按原版 PPT 图层顺序解析幻灯片（背景、形状、图片） */
export async function parseSlideVisualLayers(
  zip: JSZip,
  slidePath: string,
  xml: string,
): Promise<ParsedSlideVisual> {
  const layers: SlideVisualLayer[] = [];
  const urlCache = new Map<string, string>();
  const slideSize = await loadSlideSizeEmu(zip);
  const schemeColors = await loadThemeSchemeColors(zip);
  const defaultTextColor = await loadDefaultTextColor(zip, schemeColors);

  async function urlForEmbed(rId: string): Promise<string | null> {
    const mediaPath = await resolveMediaPath(zip, slidePath, rId);
    if (!mediaPath) return null;
    if (urlCache.has(mediaPath)) return urlCache.get(mediaPath)!;
    const url = await mediaToUrl(zip, mediaPath);
    if (url) urlCache.set(mediaPath, url);
    return url;
  }

  const bgEmbed = xml.match(/<p:bg>[\s\S]*?<a:blip r:embed="([^"]+)"/)?.[1];
  if (bgEmbed) {
    const url = await urlForEmbed(bgEmbed);
    if (url) layers.push({ kind: 'background', url });
  }

  const spTree = xml.match(/<p:spTree>([\s\S]*)<\/p:spTree>/)?.[1] ?? xml;
  const blocks = [...spTree.matchAll(/<p:(sp|pic|graphicFrame)>[\s\S]*?<\/p:\1>/g)];
  let textShapeIndex = 0;

  for (const block of blocks) {
    const chunk = block[0];
    const box = extractShapeBox(chunk, slideSize);
    if (!box) continue;
    const { widthEmu, heightEmu, ...boxPct } = box;
    const rawId = chunk.match(/<p:cNvPr[^>]*\sid="(\d+)"/)?.[1];
    const elementId = rawId ? Number(rawId) : undefined;

    if (chunk.startsWith('<p:pic>')) {
      const embed = chunk.match(/r:embed="([^"]+)"/)?.[1];
      if (!embed) continue;
      const url = await urlForEmbed(embed);
      if (!url) continue;
      layers.push({ kind: 'image', url, elementId, ...boxPct });
      continue;
    }

    if (chunk.startsWith('<p:graphicFrame>')) {
      const tbl = chunk.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)?.[0];
      if (!tbl) continue;
      const rows = [...tbl.matchAll(/<a:tr[^>]*>[\s\S]*?<\/a:tr>/g)].map((tr) => ({
        cells: [...tr[0].matchAll(/<a:tc[^>]*>[\s\S]*?<\/a:tc>/g)].map((tc) => ({
          text: [...tc[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
            .map((m) => decodeXmlEntities(m[1]))
            .join(''),
          bold: /\sb="1"/.test(tc[0]),
        })),
      }));
      if (rows.length) layers.push({ kind: 'table', elementId, rows, ...boxPct });
      continue;
    }

    const fill = extractShapeFillColor(chunk, schemeColors) ?? undefined;
    const line = extractShapeLineColor(chunk, schemeColors) ?? undefined;
    const hasText = chunk.includes('<p:txBody>');

    if (hasText) {
      const txBody = chunk.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1] ?? '';
      const text = extractTextContent(chunk, schemeColors, defaultTextColor);
      const paddingPct = extractTextBoxPadding(txBody, slideSize.cx);
      const shapeIndex = textShapeIndex;
      textShapeIndex += 1;
      if (text.paragraphs.length) {
        layers.push({ kind: 'shape', shapeIndex, elementId, fill, line, ...boxPct, ...text, paddingPct });
      } else {
        // 空文本框也计入序号，便于与 XML 顺序对齐
        layers.push({
          kind: 'shape',
          shapeIndex,
          elementId,
          fill,
          line,
          paragraphs: [],
          ...boxPct,
          valign: 'top',
          paddingPct,
        });
      }
    } else if (fill || line) {
      layers.push({ kind: 'shape', elementId, fill, line, paragraphs: [], ...boxPct, valign: 'top' });
    }
  }

  return { layers, slideSize };
}

export function revokeSlideVisualLayers(layers: SlideVisualLayer[]): void {
  for (const layer of layers) {
    if (layer.kind === 'background' || layer.kind === 'image') {
      if (layer.url.startsWith('blob:')) URL.revokeObjectURL(layer.url);
    }
  }
}
