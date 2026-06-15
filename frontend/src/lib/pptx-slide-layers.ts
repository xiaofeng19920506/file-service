import type JSZip from 'jszip';

const SLIDE_CX = 9144000;
const SLIDE_CY = 6858000;

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
      lines: string[];
      left: number;
      top: number;
      width: number;
      height: number;
      align: 'left' | 'center' | 'right';
      color?: string;
      bold?: boolean;
      fontSizePt?: number;
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

function extractShapeBox(xml: string): { left: number; top: number; width: number; height: number } | null {
  const off = xml.match(/<a:off x="(\d+)" y="(\d+)"/);
  const ext = xml.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
  if (!off || !ext) return null;
  return {
    left: emuPct(Number(off[1]), SLIDE_CX),
    top: emuPct(Number(off[2]), SLIDE_CY),
    width: emuPct(Number(ext[1]), SLIDE_CX),
    height: emuPct(Number(ext[2]), SLIDE_CY),
  };
}

function extractFillColor(xml: string): string | null {
  const rgb = xml.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (rgb) return `#${rgb[1]}`;
  const scheme = xml.match(/<a:solidFill>[\s\S]*?<a:schemeClr val="([^"]+)"/);
  if (scheme) {
    const map: Record<string, string> = {
      lt2: '#F3F3F3',
      accent6: '#FFFFFF',
    };
    return map[scheme[1]] ?? null;
  }
  return null;
}

function extractTextRuns(xml: string): {
  lines: string[];
  align: 'left' | 'center' | 'right';
  color?: string;
  bold?: boolean;
  fontSizePt?: number;
} {
  const paragraphs = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)];
  const lines: string[] = [];
  let align: 'left' | 'center' | 'right' = 'left';
  let color: string | undefined;
  let bold = false;
  let fontSizePt: number | undefined;

  for (const p of paragraphs) {
    const pXml = p[1];
    const algn = pXml.match(/algn="([^"]+)"/)?.[1];
    if (algn === 'ctr') align = 'center';
    else if (algn === 'r') align = 'right';

    const texts = [...pXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((m) => decodeXmlEntities(m[1].replace(/\s+/g, ' ').trim()))
      .filter(Boolean);
    if (texts.length) lines.push(texts.join(' '));

    const rgb = pXml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    if (rgb) color = `#${rgb[1]}`;
    const sz = pXml.match(/sz="(\d+)"/);
    if (sz) fontSizePt = Number(sz[1]) / 100;
    if (/<a:rPr[^>]*\sb="1"/.test(pXml)) bold = true;
  }

  return { lines, align, color, bold, fontSizePt };
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

/** 按原版 PPT 图层顺序解析幻灯片（背景、色块、文字、图片） */
export async function parseSlideVisualLayers(
  zip: JSZip,
  slidePath: string,
  xml: string,
): Promise<SlideVisualLayer[]> {
  const layers: SlideVisualLayer[] = [];
  const urlCache = new Map<string, string>();

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

    const fill = extractFillColor(chunk);
    const hasText = chunk.includes('<p:txBody>');
    if (fill && !hasText) {
      layers.push({ kind: 'fill', color: fill, ...box });
      continue;
    }

    if (hasText) {
      const text = extractTextRuns(chunk);
      if (!text.lines.length) continue;
      layers.push({ kind: 'text', ...box, ...text });
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
