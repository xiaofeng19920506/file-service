import type JSZip from 'jszip';

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
};

export type SlideVisualLayer =
  | {
      kind: 'background';
      url: string;
    }
  | {
      kind: 'image';
      url: string;
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | {
      kind: 'shape';
      fill?: string;
      paragraphs: SlideTextParagraph[];
      left: number;
      top: number;
      width: number;
      height: number;
      valign?: 'top' | 'middle' | 'bottom';
      autoFit?: boolean;
      paddingPct?: { top: number; right: number; bottom: number; left: number };
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

function extractShapeBoxEmu(chunk: string): {
  left: number;
  top: number;
  width: number;
  height: number;
  widthEmu: number;
  heightEmu: number;
} | null {
  const spPr = chunk.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1] ?? chunk;
  const off = spPr.match(/<a:off x="(\d+)" y="(\d+)"/);
  const ext = spPr.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
  if (!off || !ext) return null;
  const widthEmu = Number(ext[1]);
  const heightEmu = Number(ext[2]);
  return {
    left: Number(off[1]),
    top: Number(off[2]),
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

function extractTextBoxPadding(
  txBody: string,
  widthEmu: number,
  heightEmu: number,
): { top: number; right: number; bottom: number; left: number } {
  const bodyPr = txBody.match(/<a:bodyPr([^/]*)\/>/)?.[1] ?? txBody.match(/<a:bodyPr([^>]*)>/)?.[1] ?? '';
  const read = (attr: string, base: number) => {
    const m = bodyPr.match(new RegExp(`${attr}="(\\d+)"`));
    return m && base > 0 ? (Number(m[1]) / base) * 100 : 0;
  };
  return {
    top: read('tIns', heightEmu),
    right: read('rIns', widthEmu),
    bottom: read('bIns', heightEmu),
    left: read('lIns', widthEmu),
  };
}

/** 从 `ppt/presentation.xml` 读取幻灯片宽高（EMU） */
export async function loadSlideSizeEmu(zip: JSZip): Promise<SlideSizeEmu> {
  const entry = zip.file('ppt/presentation.xml');
  if (!entry) return { ...DEFAULT_SLIDE_SIZE };
  const xml = await entry.async('string');
  const block = xml.match(/<p:sldSz[^/>]*\/>/)?.[0];
  if (!block) return { ...DEFAULT_SLIDE_SIZE };
  const cx = Number(block.match(/cx="(\d+)"/)?.[1]);
  const cy = Number(block.match(/cy="(\d+)"/)?.[1]);
  if (!cx || !cy) return { ...DEFAULT_SLIDE_SIZE };
  return { cx, cy };
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

function extractRunStyle(
  rPrXml: string,
  schemeColors: Record<string, string>,
): Omit<SlideTextRun, 'text'> {
  let color: string | undefined;
  const rgb = rPrXml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (rgb) color = `#${rgb[1]}`;
  const scheme = rPrXml.match(/<a:schemeClr val="([^"]+)"/);
  if (scheme) color = resolveSchemeColor(schemeColors, scheme[1]) ?? color;
  const sz = rPrXml.match(/sz="(\d+)"/);
  const fontSizePt = sz ? Number(sz[1]) / 100 : undefined;
  const bold = /\sb="1"/.test(rPrXml);
  const ea = rPrXml.match(/<a:ea typeface="([^"]+)"/)?.[1];
  const latin = rPrXml.match(/<a:latin typeface="([^"]+)"/)?.[1];
  const fontFamily = ea || latin;
  return {
    color: color ?? schemeColors.tx1 ?? schemeColors.dk2 ?? '#1E2D31',
    bold,
    fontSizePt,
    fontFamily,
  };
}

function extractTextContent(
  xml: string,
  schemeColors: Record<string, string>,
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
    const lineSpacing = lnSpc ? Number(lnSpc) / 100_000 : 1;

    const runs: SlideTextRun[] = [];
    for (const run of pXml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
      const rXml = run[1];
      const t = rXml.match(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/)?.[2];
      if (t === undefined) continue;
      const text = decodeXmlEntities(t);
      if (!text && !/\s/.test(t)) continue;
      const rPrXml =
        rXml.match(/<a:rPr[^>]*>[\s\S]*?<\/a:rPr>/)?.[0]
        ?? rXml.match(/<a:rPr[^/]*\/>/)?.[0]
        ?? '<a:rPr/>';
      runs.push({ text, ...extractRunStyle(rPrXml, schemeColors) });
    }

    if (runs.length) {
      paragraphs.push({ runs, align, lineSpacing });
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

  return { paragraphs, valign, autoFit };
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
  const blocks = [...spTree.matchAll(/<p:(sp|pic)>[\s\S]*?<\/p:\1>/g)];

  for (const block of blocks) {
    const chunk = block[0];
    const box = extractShapeBox(chunk, slideSize);
    if (!box) continue;
    const { widthEmu, heightEmu, ...boxPct } = box;

    if (chunk.startsWith('<p:pic>')) {
      const embed = chunk.match(/r:embed="([^"]+)"/)?.[1];
      if (!embed) continue;
      const url = await urlForEmbed(embed);
      if (!url) continue;
      layers.push({ kind: 'image', url, ...boxPct });
      continue;
    }

    const fill = extractShapeFillColor(chunk, schemeColors) ?? undefined;
    const hasText = chunk.includes('<p:txBody>');

    if (hasText) {
      const txBody = chunk.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1] ?? '';
      const text = extractTextContent(chunk, schemeColors);
      const paddingPct = extractTextBoxPadding(txBody, box.widthEmu, box.heightEmu);
      if (text.paragraphs.length) {
        layers.push({ kind: 'shape', fill, ...boxPct, ...text, paddingPct });
      }
    } else if (fill) {
      layers.push({ kind: 'shape', fill, paragraphs: [], ...boxPct, valign: 'top' });
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
