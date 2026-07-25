/**
 * 页内编辑的内存文档模型。
 *
 * Ribbon 命令不重打包 zip，而是改写内存里的 slideN.xml 字符串
 * （存在 EditableSlide.slideXmlOverride，天然进入 undo/redo 快照），
 * 画布只重渲当前页，保存时整份写回。
 */
import JSZip from './jszip';
import { DEFAULT_SLIDE_SIZE, slideSizeFromXml, type SlideSize } from './ppt-ops/xml';
import type { EditableSlide } from './pptx-preview';

export type SlideXmlMap = Map<string, string>;

export type PptLayout = {
  path: string;
  name: string;
};

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
const LAYOUT_RE = /^ppt\/slideLayouts\/slideLayout(\d+)\.xml$/;

function num(path: string): number {
  return Number.parseInt(path.match(/(\d+)\.xml$/)?.[1] ?? '0', 10);
}

function decodeXmlAttr(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 一次性读出所有 slideN.xml，作为未编辑页的基准内容 */
export async function loadSlideXmlMap(file: Blob): Promise<SlideXmlMap> {
  const zip = await JSZip.loadAsync(file);
  const map: SlideXmlMap = new Map();
  const paths = Object.keys(zip.files)
    .filter((n) => SLIDE_RE.test(n))
    .sort((a, b) => num(a) - num(b));
  for (const path of paths) {
    const entry = zip.file(path);
    if (!entry) continue;
    map.set(path, await entry.async('string'));
  }
  return map;
}

/** 读取幻灯片尺寸（EMU） */
export async function loadSlideSize(file: Blob): Promise<SlideSize> {
  try {
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file('ppt/presentation.xml')?.async('string');
    return slideSizeFromXml(xml);
  } catch {
    return { ...DEFAULT_SLIDE_SIZE };
  }
}

/** 读取版式列表，用于「新建幻灯片 / 版式」图库 */
export async function loadSlideLayouts(file: Blob): Promise<PptLayout[]> {
  const zip = await JSZip.loadAsync(file);
  const paths = Object.keys(zip.files)
    .filter((n) => LAYOUT_RE.test(n))
    .sort((a, b) => num(a) - num(b));

  const layouts: PptLayout[] = [];
  for (const path of paths) {
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async('string');
    const raw = xml.match(/<p:cSld[^>]*\sname="([^"]*)"/)?.[1];
    layouts.push({
      path,
      name: raw ? decodeXmlAttr(raw) : `版式 ${num(path)}`,
    });
  }
  return layouts;
}

/** 当前页的有效 XML：优先取编辑结果 */
export function getSlideXml(slide: EditableSlide | null | undefined, base: SlideXmlMap): string | null {
  if (!slide) return null;
  if (slide.slideXmlOverride) return slide.slideXmlOverride;
  if (!slide.slidePath) return null;
  return base.get(slide.slidePath) ?? null;
}

/** 该页是否可以做页内 XML 编辑（新页尚未写入 zip 前不行） */
export function canEditSlideXml(slide: EditableSlide | null | undefined, base: SlideXmlMap): boolean {
  if (!slide || slide.pending || slide.isNew) return false;
  return !!getSlideXml(slide, base);
}
