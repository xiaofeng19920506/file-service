import type JSZip from 'jszip';

const SLIDE_CX = 9144000;
const SLIDE_CY = 6858000;

const SCHEME_COLORS: Record<string, string> = {
  accent6: '#FFFFFF',
  lt2: '#F3F3F3',
  dk1: '#000000',
  bg1: '#FFFFFF',
  tx1: '#000000',
};

export type SlideTextLine = {
  text: string;
  color?: string;
  bold?: boolean;
  fontSizePt?: number;
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
      lines: SlideTextLine[];
      left: number;
      top: number;
      width: number;
      height: number;
      align: 'left' | 'center' | 'right';
      valign?: 'top' | 'middle' | 'bottom';
      /** 形状启用 spAutoFit 时，文字需缩放进框内 */
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

/** 仅读取形状底色（p:spPr），不混入文字 run 颜色 */
function extractShapeFillColor(chunk: string): string | null {
  const spPr = chunk.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1];
  if (!spPr || !spPr.includes('<a:solidFill>')) return null;

  const rgb = spPr.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (rgb) return `#${rgb[1]}`;

  const scheme = spPr.match(/<a:solidFill>[\s\S]*?<a:schemeClr val="([^"]+)"/);
  if (scheme) return SCHEME_COLORS[scheme[1]] ?? null;

  return null;
}

function extractRunStyle(rPr: string): { color?: string; bold?: boolean; fontSizePt?: number } {
  let color: string | undefined;
  const rgb = rPr.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (rgb) color = `#${rgb[1]}`;
  const scheme = rPr.match(/<a:schemeClr val="([^"]+)"/);
  if (scheme) color = SCHEME_COLORS[scheme[1]] ?? color;
  const sz = rPr.match(/sz="(\d+)"/);
  const fontSizePt = sz ? Number(sz[1]) / 100 : undefined;
  const bold = /\sb="1"/.test(rPr);
  return { color, bold, fontSizePt };
}

function extractTextRuns(xml: string): {
  lines: SlideTextLine[];
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  autoFit: boolean;
} {
  const txBody = xml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1] ?? '';
  const bodyPr = txBody.match(/<a:bodyPr([^/]*)\/>/)?.[1] ?? txBody.match(/<a:bodyPr([^>]*)>/)?.[1] ?? '';
  const autoFit = /<a:spAutoFit\s*\/?>/.test(txBody);
  let align: 'left' | 'center' | 'right' = 'left';
  let valign: 'top' | 'middle' | 'bottom' = 'top';
  if (bodyPr.includes('anchor="ctr"')) valign = 'middle';
  else if (bodyPr.includes('anchor="b"')) valign = 'bottom';

  const lines: SlideTextLine[] = [];
  const paragraphs = [...txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)];

  for (const p of paragraphs) {
    const pXml = p[1];
    const algn = pXml.match(/<a:pPr[^>]*algn="([^"]+)"/)?.[1];
    if (algn === 'ctr') align = 'center';
    else if (algn === 'r') align = 'right';

    const runs = [...pXml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)];
    if (runs.length) {
      const parts: string[] = [];
      let lineStyle: Omit<SlideTextLine, 'text'> = {};
      for (const run of runs) {
        const rXml = run[1];
        const t = rXml.match(/<a:t>([\s\S]*?)<\/a:t>/)?.[1];
        if (!t) continue;
        const text = decodeXmlEntities(t.replace(/\s+/g, ' ').trim());
        if (!text) continue;
        parts.push(text);
        const rPr = rXml.match(/<a:rPr([^>]*)>/)?.[1] ?? '';
        lineStyle = { ...lineStyle, ...extractRunStyle(`<a:rPr${rPr}>`) };
      }
      const joined = parts.join(' ').trim();
      if (joined) lines.push({ text: joined, ...lineStyle });
    } else {
      const texts = [...pXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map((m) => decodeXmlEntities(m[1].replace(/\s+/g, ' ').trim()))
        .filter(Boolean);
      if (texts.length) lines.push({ text: texts.join(' ') });
    }
  }

  return { lines, align, valign, autoFit };
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

    const fill = extractShapeFillColor(chunk);
    const hasText = chunk.includes('<p:txBody>');

    if (fill) {
      layers.push({ kind: 'fill', color: fill, ...box });
    }

    if (hasText) {
      const text = extractTextRuns(chunk);
      if (text.lines.length) {
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
