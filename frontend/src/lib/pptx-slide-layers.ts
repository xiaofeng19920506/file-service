import type JSZip from 'jszip';

const SLIDE_CX = 9144000;
const SLIDE_CY = 6858000;

const FALLBACK_SCHEME: Record<string, string> = {
  accent6: '#F8E71C',
  lt2: '#F3F3F3',
  dk1: '#FFFFFF',
  bg1: '#FFFFFF',
  tx1: '#000000',
};

export type SlideTextRun = {
  text: string;
  color?: string;
  bold?: boolean;
  fontSizePt?: number;
  fontFamily?: string;
};

export type SlideTextParagraph = {
  runs: SlideTextRun[];
  align: 'left' | 'center' | 'right';
  lineSpacing: number;
};

export type SlideVisualLayer =
  | {
      kind: 'background';
      url: string;
    }
  | {
      kind: 'fill';
      color: string;
      left: number;
      top: number;
      width: number;
      height: number;
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
      kind: 'text';
      paragraphs: SlideTextParagraph[];
      left: number;
      top: number;
      width: number;
      height: number;
      valign?: 'top' | 'middle' | 'bottom';
      autoFit?: boolean;
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

function extractShapeBox(xml: string): { left: number; top: number; width: number; height: number } | null {
  const spPr = xml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1] ?? xml;
  const off = spPr.match(/<a:off x="(\d+)" y="(\d+)"/);
  const ext = spPr.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
  if (!off || !ext) return null;
  return {
    left: emuPct(Number(off[1]), SLIDE_CX),
    top: emuPct(Number(off[2]), SLIDE_CY),
    width: emuPct(Number(ext[1]), SLIDE_CX),
    height: emuPct(Number(ext[2]), SLIDE_CY),
  };
}

function resolveSchemeColor(schemeColors: Record<string, string>, schemeName: string): string | null {
  return schemeColors[schemeName] ?? FALLBACK_SCHEME[schemeName] ?? null;
}

/** 仅读取形状底色（p:spPr），不混入文字 run 颜色 */
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
  return { color, bold, fontSizePt, fontFamily };
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
      const rPr = rXml.match(/<a:rPr([^>]*)>/)?.[1] ?? '';
      runs.push({ text, ...extractRunStyle(`<a:rPr${rPr}>`, schemeColors) });
    }

    if (runs.length) {
      paragraphs.push({ runs, align, lineSpacing });
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

function autoFitScale(layer: Extract<SlideVisualLayer, { kind: 'text' }>): number {
  if (!layer.autoFit || !layer.paragraphs.length) return 1;
  const slideHeightPt = (SLIDE_CY / 914400) * 72;
  const boxHeightPt = (layer.height / 100) * slideHeightPt;
  let contentPt = 0;
  for (const p of layer.paragraphs) {
    const maxPt = Math.max(...p.runs.map((r) => r.fontSizePt ?? 14), 14);
    contentPt += maxPt * (p.lineSpacing || 1);
  }
  if (contentPt <= 0) return 1;
  return Math.min(1, (boxHeightPt / contentPt) * 0.92);
}

export { autoFitScale };

/** 按原版 PPT 图层顺序解析幻灯片（背景、色块、文字、图片） */
export async function parseSlideVisualLayers(
  zip: JSZip,
  slidePath: string,
  xml: string,
): Promise<SlideVisualLayer[]> {
  const layers: SlideVisualLayer[] = [];
  const urlCache = new Map<string, string>();
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
    const box = extractShapeBox(chunk);
    if (!box) continue;

    if (chunk.startsWith('<p:pic>')) {
      const embed = chunk.match(/r:embed="([^"]+)"/)?.[1];
      if (!embed) continue;
      const url = await urlForEmbed(embed);
      if (!url) continue;
      layers.push({ kind: 'image', url, ...box });
      continue;
    }

    const fill = extractShapeFillColor(chunk, schemeColors);
    const hasText = chunk.includes('<p:txBody>');

    if (fill) {
      layers.push({ kind: 'fill', color: fill, ...box });
    }

    if (hasText) {
      const text = extractTextContent(chunk, schemeColors);
      if (text.paragraphs.length) {
        layers.push({ kind: 'text', ...box, ...text });
      }
    }
  }

  return layers;
}

export function revokeSlideVisualLayers(layers: SlideVisualLayer[]): void {
  for (const layer of layers) {
    if (layer.kind === 'background' || layer.kind === 'image') {
      if (layer.url.startsWith('blob:')) URL.revokeObjectURL(layer.url);
    }
  }
}
