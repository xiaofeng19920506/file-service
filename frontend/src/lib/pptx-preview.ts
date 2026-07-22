import JSZip from 'jszip';

export type SlideBackgroundKind = 'image' | 'solid' | 'none';

export type EditableSlide = {
  index: number;
  slideInFile: number;
  slidePath: string;
  sourceFile: string;
  sourceItemId?: string;
  title: string;
  snippet: string;
  textLines: string[];
  imageUrls: string[];
  /** zip 内 media 路径，与 imageUrls 一一对应 */
  imageMediaPaths: string[];
  /** 待写入 PPTX 的图片替换（mediaPath → Blob） */
  imageReplacements?: Record<string, Blob>;
  /** 替换图预览 URL（mediaPath → blob:） */
  imagePreviewUrls?: Record<string, string>;
  /** 幻灯片背景：图 / 纯色 / 无 */
  backgroundKind: SlideBackgroundKind;
  /** 背景图在 zip 内的 media 路径 */
  backgroundMediaPath?: string;
  /** 背景纯色（RRGGBB，无 #） */
  backgroundColor?: string;
  /** 背景预览 URL（原图或替换后） */
  backgroundPreviewUrl?: string;
  /** 待写入的背景图替换 */
  backgroundReplacement?: Blob;
  pending?: boolean;
  editable: boolean;
  /** 尚未写入 PPTX，确认保存时再复制 */
  isNew?: boolean;
  clientId?: string;
  duplicateFromPath?: string;
  /** 插入位置：该页路径之后；null 表示文件开头 */
  insertAfterPath?: string | null;
  /** 复制后清空文字 */
  blank?: boolean;
  /** 服务端转换预览失败 */
  previewFailed?: boolean;
};

function slideNumber(path: string): number {
  return parseInt(path.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
}

export type PptxPresentationSlideRef = {
  /** 演示顺序（1-based，与 LibreOffice / 预览 PNG API 一致） */
  index: number;
  slideInFile: number;
  slidePath: string;
};

function relTargetToSlidePath(target: string): string {
  const normalized = target.replace(/\\/g, '/');
  if (normalized.startsWith('ppt/')) return normalized;
  if (normalized.startsWith('slides/')) return `ppt/${normalized}`;
  const file = normalized.split('/').pop();
  return file ? `ppt/slides/${file}` : `ppt/slides/${normalized}`;
}

/** 按 presentation.xml 放映顺序列出幻灯片（复制加页后不能用文件编号排序） */
export async function listPptxSlidesInPresentationOrder(
  file: Blob,
): Promise<PptxPresentationSlideRef[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const { presEntry, relsEntry } = readPresentationParts(zip);
  const presXml = await presEntry.async('string');
  const relsXml = await relsEntry.async('string');

  const relIdToPath = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
    const target = match[2];
    if (!target.includes('slide')) continue;
    relIdToPath.set(match[1], relTargetToSlidePath(target));
  }
  for (const match of relsXml.matchAll(/<Relationship[^>]*Target="([^"]+)"[^>]*Id="(rId\d+)"/g)) {
    const target = match[1];
    if (!target.includes('slide')) continue;
    if (!relIdToPath.has(match[2])) relIdToPath.set(match[2], relTargetToSlidePath(target));
  }

  const slides: PptxPresentationSlideRef[] = [];
  let index = 0;
  for (const match of presXml.matchAll(/<p:sldId[^>]*r:id="(rId\d+)"[^>]*\/>/g)) {
    const slidePath = relIdToPath.get(match[1]);
    if (!slidePath || !zip.file(slidePath)) continue;
    index += 1;
    slides.push({
      index,
      slideInFile: slideNumber(slidePath),
      slidePath,
    });
  }
  return slides;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 按 <a:r> 内文字 run 序号替换（含仅空格的间距 run） */
export function applyIndexedTextReplacementsToSlideXml(
  xml: string,
  replacements: { textIndex: number; text: string; fontSizePt?: number }[],
): string {
  const byIndex = new Map(replacements.map((r) => [r.textIndex, r]));
  let idx = 0;
  return xml.replace(/<a:r>([\s\S]*?)<\/a:r>/g, (runXml) => {
    const textMatch = runXml.match(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/);
    if (!textMatch) return runXml;
    const content = textMatch[2];
    if (!content.trim() && !/\s/.test(content)) return runXml;

    const current = idx++;
    const rep = byIndex.get(current);
    if (!rep) return runXml;

    let updated = runXml.replace(
      /<a:t([^>]*)>[\s\S]*?<\/a:t>/,
      `<a:t$1>${escapeXml(rep.text)}</a:t>`,
    );
    if (rep.fontSizePt !== undefined) {
      const sz = String(Math.round(rep.fontSizePt * 100));
      updated = /<a:rPr[^>]*sz="/.test(updated)
        ? updated.replace(/(<a:rPr[^>]*sz=")\d+(")/, `$1${sz}$2`)
        : updated.replace(/<a:rPr/, `<a:rPr sz="${sz}"`);
    }
    return updated;
  });
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function mimeFromPath(path: string): string {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.bmp')) return 'image/bmp';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

/** Extract all visible text runs from slide XML. */
export function extractTexts(xml: string): string[] {
  const texts: string[] = [];
  const re = /<(?:[\w-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const t = decodeXmlEntities(m[1].replace(/\s+/g, ' ').trim());
    if (t) texts.push(t);
  }
  return texts;
}

function resolveRelativePath(baseDir: string, target: string): string {
  const parts = baseDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function blobFromMediaEntry(
  entry: JSZip.JSZipObject,
  mediaPath: string,
): Promise<Blob | null> {
  const raw = await entry.async('blob');
  if (raw.type.startsWith('image/')) return raw;
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(mediaPath)) {
    return new Blob([raw], { type: mimeFromPath(mediaPath.toLowerCase()) });
  }
  return null;
}

async function resolveMediaPath(
  zip: JSZip,
  slidePath: string,
  rId: string,
): Promise<string | null> {
  const relsPath = slidePath
    .replace('ppt/slides/', 'ppt/slides/_rels/')
    .replace('.xml', '.xml.rels');
  const relsEntry = zip.file(relsPath);
  if (!relsEntry) return null;
  const relsXml = await relsEntry.async('string');
  const escaped = rId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = relsXml.match(
    new RegExp(`Id="${escaped}"[^>]*Target="([^"]+)"`),
  );
  if (!match) return null;
  const slideDir = slidePath.slice(0, slidePath.lastIndexOf('/'));
  return resolveRelativePath(slideDir, match[1]);
}

async function listImageRelTargets(
  zip: JSZip,
  slidePath: string,
): Promise<string[]> {
  const relsPath = slidePath
    .replace('ppt/slides/', 'ppt/slides/_rels/')
    .replace('.xml', '.xml.rels');
  const relsEntry = zip.file(relsPath);
  if (!relsEntry) return [];
  const relsXml = await relsEntry.async('string');
  const slideDir = slidePath.slice(0, slidePath.lastIndexOf('/'));
  const targets: string[] = [];
  const re =
    /<Relationship Id="[^"]+" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/image" Target="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml)) !== null) {
    targets.push(resolveRelativePath(slideDir, m[1]));
  }
  return targets;
}

async function mediaPathToUrl(
  zip: JSZip,
  mediaPath: string,
  seen: Set<string>,
): Promise<string | null> {
  if (seen.has(mediaPath)) return null;
  seen.add(mediaPath);
  const entry = zip.file(mediaPath);
  if (!entry) return null;
  const blob = await blobFromMediaEntry(entry, mediaPath);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/** Extract foreground images on a slide（不含 p:bg 背景图） */
async function extractSlideImages(
  zip: JSZip,
  slidePath: string,
  xml: string,
): Promise<{ url: string; mediaPath: string }[]> {
  const bgBlock = xml.match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0] ?? '';
  const bgEmbeds = new Set<string>();
  for (const m of bgBlock.matchAll(/r:embed="([^"]+)"/g)) {
    bgEmbeds.add(m[1]!);
  }

  const rIds: string[] = [];
  const rIdRe = /r:embed="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rIdRe.exec(xml)) !== null) {
    if (bgEmbeds.has(m[1]!)) continue;
    rIds.push(m[1]!);
  }

  const results: { url: string; mediaPath: string }[] = [];
  const seen = new Set<string>();

  for (const rId of rIds) {
    const mediaPath = await resolveMediaPath(zip, slidePath, rId);
    if (!mediaPath || seen.has(mediaPath)) continue;
    seen.add(mediaPath);
    const url = await mediaPathToUrl(zip, mediaPath, new Set());
    if (url) results.push({ url, mediaPath });
  }

  if (results.length === 0 && bgEmbeds.size === 0) {
    for (const mediaPath of await listImageRelTargets(zip, slidePath)) {
      if (seen.has(mediaPath)) continue;
      seen.add(mediaPath);
      const url = await mediaPathToUrl(zip, mediaPath, new Set());
      if (url) results.push({ url, mediaPath });
    }
  }

  return results;
}

function applyTextsToSlideXml(xml: string, title: string, snippet: string): string {
  const snippetParts = snippet
    ? snippet.split(/\n| · /).map((s) => s.trim()).filter(Boolean)
    : [];
  const replacements = [title, ...snippetParts];
  let idx = 0;
  return xml.replace(
    /<((?:[\w-]+:)?t)([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?t>/g,
    (full, tag, attrs, content) => {
      if (!content.trim()) return full;
      const next = replacements[idx] ?? content;
      idx++;
      return `<${tag}${attrs}>${escapeXml(next)}</${tag}>`;
    },
  );
}

export function revokeSlideUrls(slides: EditableSlide[]): void {
  for (const s of slides) {
    for (const url of s.imageUrls) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
    if (s.imagePreviewUrls) {
      for (const url of Object.values(s.imagePreviewUrls)) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      }
    }
    if (s.backgroundPreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(s.backgroundPreviewUrl);
    }
  }
}

export function isPptxFile(file: File | Blob, name?: string): boolean {
  const n = name ?? (file instanceof File ? file.name : '');
  const ext = n.split('.').pop()?.toLowerCase();
  return ext === 'pptx';
}

export function needsPreviewConversion(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return [
    'ppt',
    'pps',
    'pot',
    'odp',
    'ppsx',
    'potx',
    'fodp',
    'otp',
  ].includes(ext);
}

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** 编辑删页时使用的 PPTX 源（非 pptx 则拉取服务端转换结果） */
export async function resolveEditablePptxFile(
  file: File,
  name: string,
  blobId: string,
  fetchPreview: FetchPreviewPptx,
): Promise<File> {
  if (isPptxFile(file, name)) return file;
  const blob = await fetchPreview(blobId);
  const pptxName = `${name.replace(/\.[^.]+$/, '')}.pptx`;
  return new File([blob], pptxName, { type: PPTX_MIME });
}

export type FetchPreviewPptx = (blobId: string) => Promise<Blob>;

export async function resolvePreviewBlob(
  file: File,
  name: string,
  blobId: string | undefined,
  fetchPreview: FetchPreviewPptx,
): Promise<Blob> {
  if (isPptxFile(file, name)) return file;
  if (needsPreviewConversion(name)) {
    if (!blobId) throw new Error('missing_blob_id');
    return fetchPreview(blobId);
  }
  throw new Error('unsupported_preview_format');
}

async function extractSlideBackground(
  zip: JSZip,
  slidePath: string,
  xml: string,
): Promise<{
  kind: SlideBackgroundKind;
  mediaPath?: string;
  color?: string;
  url?: string;
}> {
  const bgBlock = xml.match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0];
  if (!bgBlock) return { kind: 'none' };

  const solid = bgBlock.match(/<a:solidFill>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (solid) {
    return { kind: 'solid', color: solid[1]!.toUpperCase() };
  }

  const embed =
    bgBlock.match(/<a:blip[^>]*r:embed="([^"]+)"/)?.[1] ??
    bgBlock.match(/r:embed="([^"]+)"/)?.[1];
  if (embed) {
    const mediaPath = await resolveMediaPath(zip, slidePath, embed);
    if (mediaPath) {
      const url = await mediaPathToUrl(zip, mediaPath, new Set());
      if (url) return { kind: 'image', mediaPath, url };
      return { kind: 'image', mediaPath };
    }
  }

  return { kind: 'none' };
}

function buildSlideFromParts(
  slideInFile: number,
  path: string,
  texts: string[],
  images: { url: string; mediaPath: string }[],
  background: {
    kind: SlideBackgroundKind;
    mediaPath?: string;
    color?: string;
    url?: string;
  },
  meta?: { sourceFile?: string; sourceItemId?: string },
  displayIndex?: number,
): EditableSlide {
  const imageUrls = images.map((i) => i.url);
  const imageMediaPaths = images.map((i) => i.mediaPath);
  const title = texts[0] ?? (imageUrls.length > 0 ? `第 ${slideInFile} 页` : `幻灯片 ${slideInFile}`);

  return {
    index: displayIndex ?? slideInFile,
    slideInFile,
    slidePath: path,
    sourceFile: meta?.sourceFile ?? 'presentation.pptx',
    sourceItemId: meta?.sourceItemId,
    title,
    snippet: (texts.length > 1 ? texts.slice(1) : []).join('\n'),
    textLines: texts,
    imageUrls,
    imageMediaPaths,
    backgroundKind: background.kind,
    backgroundMediaPath: background.mediaPath,
    backgroundColor: background.color,
    backgroundPreviewUrl: background.url,
    editable: texts.length > 0 || imageUrls.length > 0 || background.kind !== 'none',
  };
}

export async function parsePptxSlidesDetailed(
  file: Blob,
  meta?: { sourceFile?: string; sourceItemId?: string },
): Promise<EditableSlide[]> {
  const zip = await JSZip.loadAsync(file);
  const slidePaths = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: EditableSlide[] = [];
  for (const path of slidePaths) {
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async('string');
    const texts = extractTexts(xml);
    const images = await extractSlideImages(zip, path, xml);
    const background = await extractSlideBackground(zip, path, xml);
    slides.push(
      buildSlideFromParts(
        slideNumber(path),
        path,
        texts,
        images,
        background,
        meta,
        slides.length + 1,
      ),
    );
  }
  return slides;
}

export async function applySlidesToPptx(
  file: Blob,
  slides: Pick<EditableSlide, 'slidePath' | 'title' | 'snippet'>[],
  filename: string,
): Promise<File> {
  const zip = await JSZip.loadAsync(file);
  for (const slide of slides) {
    if (!slide.slidePath) continue;
    const entry = zip.file(slide.slidePath);
    if (!entry) continue;
    const xml = await entry.async('string');
    zip.file(slide.slidePath, applyTextsToSlideXml(xml, slide.title, slide.snippet));
  }
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], filename, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

export async function buildMergePreview(
  files: { id: string; file: File; name: string; blobId?: string }[],
  fetchPreview?: FetchPreviewPptx,
): Promise<EditableSlide[]> {
  const result: EditableSlide[] = [];
  let index = 1;

  for (const { id, file, name, blobId } of files) {
    try {
      const previewBlob =
        isPptxFile(file, name) || (needsPreviewConversion(name) && blobId && fetchPreview)
          ? await resolvePreviewBlob(file, name, blobId, fetchPreview ?? (async () => file))
          : null;

      if (previewBlob) {
        const slides = await parsePptxSlidesDetailed(previewBlob, {
          sourceFile: name,
          sourceItemId: id,
        });
        if (slides.length === 0) {
          result.push({
            index: index++,
            slideInFile: 1,
            slidePath: '',
            sourceFile: name,
            sourceItemId: id,
            title: name,
            snippet: '',
            textLines: [],
            imageUrls: [],
            imageMediaPaths: [],
            backgroundKind: 'none',
            editable: false,
          });
          continue;
        }
        const converted = needsPreviewConversion(name);
        for (const slide of slides) {
          result.push({
            ...slide,
            index: index++,
            editable: converted ? false : slide.editable,
          });
        }
        continue;
      }
    } catch {
      /* fall through to placeholder */
    }

    result.push({
      index: index++,
      slideInFile: 1,
      slidePath: '',
      sourceFile: name,
      sourceItemId: id,
      title: name.replace(/\.[^.]+$/, ''),
      snippet: '',
      textLines: [],
      imageUrls: [],
      imageMediaPaths: [],
      backgroundKind: 'none',
      pending: true,
      previewFailed: needsPreviewConversion(name),
      editable: false,
    });
  }

  return result;
}

export function slidesEqual(a: EditableSlide[], b: EditableSlide[]): boolean {
  return slidesContentEqual(a, b);
}

export function slideIdentity(slide: EditableSlide): string {
  if (slide.isNew && slide.clientId) return `new:${slide.clientId}`;
  if (slide.isNew) {
    return `new:${slide.sourceItemId ?? 'local'}:${slide.duplicateFromPath}:${slide.index}`;
  }
  return `${slide.sourceItemId ?? 'local'}:${slide.slidePath}`;
}

export function reindexSlides(slides: EditableSlide[]): EditableSlide[] {
  return slides.map((s, i) => ({ ...s, index: i + 1 }));
}

export function slidesStructureEqual(a: EditableSlide[], b: EditableSlide[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => slideIdentity(s) === slideIdentity(b[i]));
}

export function slidesContentEqual(a: EditableSlide[], b: EditableSlide[]): boolean {
  if (!slidesStructureEqual(a, b)) return false;
  return a.every((s, i) => {
    const t = b[i];
    if (s.title !== t.title || s.snippet !== t.snippet) return false;
    if (s.backgroundKind !== t.backgroundKind) return false;
    if ((s.backgroundColor ?? '') !== (t.backgroundColor ?? '')) return false;
    if (!!s.backgroundReplacement !== !!t.backgroundReplacement) return false;
    if (s.backgroundReplacement && t.backgroundReplacement) {
      if (
        s.backgroundReplacement.size !== t.backgroundReplacement.size ||
        s.backgroundReplacement.type !== t.backgroundReplacement.type
      ) {
        return false;
      }
    }
    const repA = s.imageReplacements ?? {};
    const repB = t.imageReplacements ?? {};
    const keysA = Object.keys(repA).sort();
    const keysB = Object.keys(repB).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k, j) => {
      if (keysB[j] !== k) return false;
      return repA[k].size === repB[k].size && repA[k].type === repB[k].type;
    });
  });
}

export function slideDisplayImageUrl(slide: EditableSlide, index: number): string {
  const mediaPath = slide.imageMediaPaths[index];
  if (mediaPath && slide.imagePreviewUrls?.[mediaPath]) {
    return slide.imagePreviewUrls[mediaPath];
  }
  return slide.imageUrls[index] ?? '';
}

export async function cropImageBlob(
  blob: Blob,
  rect: { x: number; y: number; width: number; height: number },
): Promise<Blob> {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(
    img,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  img.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('crop_failed'))), blob.type || 'image/png');
  });
}

/** 将幻灯片中的图片替换写入 PPTX */
export async function applyImageReplacementsToPptx(
  file: Blob,
  slides: EditableSlide[],
): Promise<File> {
  const replacements: { mediaPath: string; blob: Blob }[] = [];
  for (const slide of slides) {
    if (!slide.imageReplacements) continue;
    for (const [mediaPath, blob] of Object.entries(slide.imageReplacements)) {
      replacements.push({ mediaPath, blob });
    }
  }
  if (!replacements.length) {
    return file instanceof File
      ? file
      : new File([file], 'presentation.pptx', { type: PPTX_MIME });
  }

  const zip = await JSZip.loadAsync(file);
  for (const { mediaPath, blob } of replacements) {
    const buf = await blob.arrayBuffer();
    zip.file(mediaPath, buf);
  }
  const filename = file instanceof File ? file.name : 'presentation.pptx';
  const out = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([out], filename, { type: PPTX_MIME });
}

function mimeExt(blob: Blob): string {
  const t = (blob.type || '').toLowerCase();
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  return 'png';
}

function nextMediaPath(zip: JSZip, ext: string): string {
  const existing = Object.keys(zip.files)
    .filter((n) => n.startsWith('ppt/media/'))
    .map((n) => n.replace(/^ppt\/media\//, ''));
  let i = 1;
  while (existing.includes(`image${i}.${ext}`)) i += 1;
  return `ppt/media/image${i}.${ext}`;
}

function buildSolidBgXml(hex: string): string {
  const val = hex.replace(/^#/, '').toUpperCase();
  return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${val}"/></a:solidFill></p:bgPr></p:bg>`;
}

function buildBlipBgXml(rId: string): string {
  return `<p:bg><p:bgPr><a:blipFill><a:blip r:embed="${rId}"><a:alphaModFix/></a:blip><a:stretch><a:fillRect/></a:stretch></a:blipFill></p:bgPr></p:bg>`;
}

function replaceOrInsertBg(xml: string, bgXml: string): string {
  if (/<p:bg>[\s\S]*?<\/p:bg>/.test(xml)) {
    return xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, bgXml);
  }
  if (xml.includes('<p:cSld>')) {
    return xml.replace('<p:cSld>', `<p:cSld>${bgXml}`);
  }
  return xml;
}

function ensureImageRelationship(relsXml: string, mediaFileName: string): { relsXml: string; rId: string } {
  const target = `../media/${mediaFileName}`;
  const existing = relsXml.match(
    new RegExp(`Id="(rId\\d+)"[^>]*Target="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
  );
  if (existing) return { relsXml, rId: existing[1]! };
  const byTargetFirst = relsXml.match(
    new RegExp(`Target="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*Id="(rId\\d+)"`),
  );
  if (byTargetFirst) return { relsXml, rId: byTargetFirst[1]! };

  const rId = nextNumericRelId(relsXml);
  const rel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`;
  const next = relsXml.includes('</Relationships>')
    ? relsXml.replace('</Relationships>', `${rel}</Relationships>`)
    : `${relsXml}${rel}`;
  return { relsXml: next, rId };
}

/** 将背景图/纯色写入 PPTX */
export async function applyBackgroundEditsToPptx(
  file: Blob,
  slides: EditableSlide[],
): Promise<File> {
  const toWrite = slides.filter((s) => {
    if (!s.slidePath) return false;
    if (s.backgroundReplacement) return true;
    // solid color without replacement — write if kind is solid
    if (s.backgroundKind === 'solid' && s.backgroundColor) return true;
    return false;
  });
  if (!toWrite.length) {
    return file instanceof File
      ? file
      : new File([file], 'presentation.pptx', { type: PPTX_MIME });
  }

  const zip = await JSZip.loadAsync(file);
  for (const slide of toWrite) {
    const entry = zip.file(slide.slidePath);
    if (!entry) continue;
    let xml = await entry.async('string');
    const relsPath = slide.slidePath
      .replace('ppt/slides/', 'ppt/slides/_rels/')
      .replace('.xml', '.xml.rels');
    const relsEntry = zip.file(relsPath);
    let relsXml = relsEntry ? await relsEntry.async('string') : null;

    if (slide.backgroundKind === 'solid' && slide.backgroundColor && !slide.backgroundReplacement) {
      xml = replaceOrInsertBg(xml, buildSolidBgXml(slide.backgroundColor));
      zip.file(slide.slidePath, xml);
      continue;
    }

    if (slide.backgroundReplacement) {
      const ext = mimeExt(slide.backgroundReplacement);
      let mediaPath = slide.backgroundMediaPath;
      let rId: string | null = null;

      if (mediaPath && zip.file(mediaPath)) {
        zip.file(mediaPath, await slide.backgroundReplacement.arrayBuffer());
        // Keep existing bg embed if present
        const embed =
          xml.match(/<p:bg>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"/)?.[1] ??
          xml.match(/<p:bg>[\s\S]*?r:embed="([^"]+)"/)?.[1];
        if (embed) {
          xml = replaceOrInsertBg(xml, buildBlipBgXml(embed));
          zip.file(slide.slidePath, xml);
          continue;
        }
      }

      mediaPath = nextMediaPath(zip, ext);
      zip.file(mediaPath, await slide.backgroundReplacement.arrayBuffer());
      const mediaFileName = mediaPath.replace(/^ppt\/media\//, '');
      if (!relsXml) {
        relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
      }
      const ensured = ensureImageRelationship(relsXml, mediaFileName);
      relsXml = ensured.relsXml;
      rId = ensured.rId;
      zip.file(relsPath, relsXml);
      xml = replaceOrInsertBg(xml, buildBlipBgXml(rId));
      zip.file(slide.slidePath, xml);
    }
  }

  const filename = file instanceof File ? file.name : 'presentation.pptx';
  const out = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([out], filename, { type: PPTX_MIME });
}

function listSlidePaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
}

function nextSlidePath(zip: JSZip): string {
  const nums = listSlidePaths(zip).map(slideNumber);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `ppt/slides/slide${next}.xml`;
}

function nextNumericRelId(relsXml: string): string {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
  return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
}

function nextSldId(presentationXml: string): number {
  const ids = [...presentationXml.matchAll(/<p:sldId id="(\d+)"/g)].map((m) =>
    parseInt(m[1], 10),
  );
  return (ids.length ? Math.max(...ids) : 255) + 1;
}

function readPresentationParts(zip: JSZip) {
  const presPath = 'ppt/presentation.xml';
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  const presEntry = zip.file(presPath);
  const relsEntry = zip.file(relsPath);
  if (!presEntry || !relsEntry) throw new Error('invalid_pptx');
  return { presPath, relsPath, presEntry, relsEntry };
}

function slidePathToRelId(relsXml: string, slidePath: string): string | null {
  const fileName = slidePath.split('/').pop()!;
  const re = new RegExp(
    `Id="(rId\\d+)"[^>]*Target="(?:slides/)?${fileName.replace('.', '\\.')}"`,
  );
  return re.exec(relsXml)?.[1] ?? null;
}

function removeContentTypeEntry(xml: string, norm: string): string {
  return xml.replace(
    new RegExp(`<Override PartName="${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^/]*/>`, 'g'),
    '',
  );
}

async function removeContentTypeAsync(zip: JSZip, partPath: string) {
  const ctPath = '[Content_Types].xml';
  const entry = zip.file(ctPath);
  if (!entry) return;
  const norm = partPath.startsWith('/') ? partPath : `/ppt/${partPath.replace(/^ppt\//, '')}`;
  let xml = await entry.async('string');
  xml = removeContentTypeEntry(xml, norm);
  zip.file(ctPath, xml);
}

async function addContentTypeAsync(zip: JSZip, partPath: string) {
  const ctPath = '[Content_Types].xml';
  const entry = zip.file(ctPath);
  if (!entry) return;
  const norm = partPath.startsWith('/') ? partPath : `/ppt/${partPath.replace(/^ppt\//, '')}`;
  let xml = await entry.async('string');
  if (xml.includes(`PartName="${norm}"`)) return;
  const override = `<Override PartName="${norm}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  xml = xml.replace('</Types>', `${override}</Types>`);
  zip.file(ctPath, xml);
}

function clearSlideTexts(xml: string): string {
  return xml.replace(
    /<((?:[\w-]+:)?t)([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?t>/g,
    (full, tag, attrs, content) => {
      if (!content.trim()) return full;
      return `<${tag}${attrs}></${tag}>`;
    },
  );
}

function remapSlideRelsAndXml(
  relsXml: string,
  slideXml: string,
): { relsXml: string; slideXml: string } {
  const idMap = new Map<string, string>();
  let counter = 1;
  for (const m of relsXml.matchAll(/Id="(rId\d+)"/g)) {
    const oldId = m[1];
    if (!idMap.has(oldId)) idMap.set(oldId, `rId${9000 + counter++}`);
  }
  let newRels = relsXml;
  let newSlide = slideXml;
  for (const [oldId, newId] of idMap) {
    newRels = newRels.replaceAll(`Id="${oldId}"`, `Id="${newId}"`);
    newSlide = newSlide.replaceAll(`r:embed="${oldId}"`, `r:embed="${newId}"`);
    newSlide = newSlide.replaceAll(`r:link="${oldId}"`, `r:link="${newId}"`);
  }
  return { relsXml: newRels, slideXml: newSlide };
}

/** 复制一页幻灯片，可选插入位置与是否清空文字 */
export async function duplicateSlideInPptx(
  file: Blob,
  sourceSlidePath: string,
  options?: { insertAfterPath?: string | null; blank?: boolean },
): Promise<{ file: File; newSlidePath: string }> {
  const zip = await JSZip.loadAsync(file);
  const srcEntry = zip.file(sourceSlidePath);
  if (!srcEntry) throw new Error('slide_not_found');

  const srcRelsPath = sourceSlidePath
    .replace('ppt/slides/', 'ppt/slides/_rels/')
    .replace('.xml', '.xml.rels');
  const srcRelsEntry = zip.file(srcRelsPath);

  const newSlidePath = nextSlidePath(zip);
  const newSlideFile = newSlidePath.split('/').pop()!;
  const newRelsPath = `ppt/slides/_rels/${newSlideFile}.rels`;

  let slideXml = await srcEntry.async('string');
  if (options?.blank) slideXml = clearSlideTexts(slideXml);

  if (srcRelsEntry) {
    let relsXml = await srcRelsEntry.async('string');
    ({ relsXml, slideXml } = remapSlideRelsAndXml(relsXml, slideXml));
    zip.file(newRelsPath, relsXml);
  }

  zip.file(newSlidePath, slideXml);
  await addContentTypeAsync(zip, newSlidePath);

  const { presPath, relsPath, presEntry, relsEntry } = readPresentationParts(zip);
  let presXml = await presEntry.async('string');
  let presRels = await relsEntry.async('string');

  const newPresRelId = nextNumericRelId(presRels);
  const target = `slides/${newSlideFile}`;
  presRels = presRels.replace('</Relationships>', `<Relationship Id="${newPresRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target}"/></Relationships>`);

  const newSldId = nextSldId(presXml);
  const sldIdTag = `<p:sldId id="${newSldId}" r:id="${newPresRelId}"/>`;

  const insertAfter = options?.insertAfterPath;
  if (insertAfter === null) {
    presXml = presXml.replace(/<p:sldIdLst>/, `<p:sldIdLst>${sldIdTag}`);
  } else if (insertAfter) {
    const afterRelId = slidePathToRelId(presRels, insertAfter);
    if (afterRelId) {
      const re = new RegExp(
        `(<p:sldId[^>]*r:id="${afterRelId}"[^/]*/>)`,
      );
      presXml = presXml.replace(re, `$1${sldIdTag}`);
    } else {
      presXml = presXml.replace('</p:sldIdLst>', `${sldIdTag}</p:sldIdLst>`);
    }
  } else {
    presXml = presXml.replace('</p:sldIdLst>', `${sldIdTag}</p:sldIdLst>`);
  }

  zip.file(presPath, presXml);
  zip.file(relsPath, presRels);

  const filename = file instanceof File ? file.name : 'presentation.pptx';
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return {
    file: new File([buf], filename, {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }),
    newSlidePath,
  };
}

/** 从 PPTX 中删除指定页面 */
export async function deleteSlidesFromPptx(file: Blob, slidePaths: string[]): Promise<File> {
  if (!slidePaths.length) {
    return file instanceof File
      ? file
      : new File([file], 'presentation.pptx', {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        });
  }

  const zip = await JSZip.loadAsync(file);
  const { presPath, relsPath, presEntry, relsEntry } = readPresentationParts(zip);
  let presXml = await presEntry.async('string');
  let presRels = await relsEntry.async('string');

  for (const slidePath of slidePaths) {
    const relId = slidePathToRelId(presRels, slidePath);
    if (relId) {
      presXml = presXml.replace(new RegExp(`<p:sldId[^>]*r:id="${relId}"[^/]*/>`, 'g'), '');
      presRels = presRels.replace(
        new RegExp(`<Relationship Id="${relId}"[^/]*/>`, 'g'),
        '',
      );
    }
    const relsFile = slidePath
      .replace('ppt/slides/', 'ppt/slides/_rels/')
      .replace('.xml', '.xml.rels');
    zip.remove(slidePath);
    zip.remove(relsFile);
    await removeContentTypeAsync(zip, slidePath);
  }

  zip.file(presPath, presXml);
  zip.file(relsPath, presRels);

  const filename = file instanceof File ? file.name : 'presentation.pptx';
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], filename, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

/** 按给定顺序重排 presentation 中的幻灯片 */
export async function reorderSlidesInPptx(file: Blob, orderedPaths: string[]): Promise<File> {
  const zip = await JSZip.loadAsync(file);
  const { presPath, presEntry, relsEntry } = readPresentationParts(zip);
  let presXml = await presEntry.async('string');
  const presRels = await relsEntry.async('string');

  const sldIdRe = /<p:sldId id="(\d+)" r:id="(rId\d+)"/g;
  const relIdToSldId = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = sldIdRe.exec(presXml)) !== null) {
    relIdToSldId.set(m[2], m[1]);
  }

  const tags: string[] = [];
  for (const path of orderedPaths) {
    const relId = slidePathToRelId(presRels, path);
    if (!relId) continue;
    const sldId = relIdToSldId.get(relId);
    if (!sldId) continue;
    tags.push(`<p:sldId id="${sldId}" r:id="${relId}"/>`);
  }

  presXml = presXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${tags.join('')}</p:sldIdLst>`);
  zip.file(presPath, presXml);

  const filename = file instanceof File ? file.name : 'presentation.pptx';
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], filename, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

/** 将预览中的增删改应用到单个 PPTX 文件 */
export async function applySlideEditsToPptx(
  file: File,
  baseline: EditableSlide[],
  target: EditableSlide[],
  _meta?: { sourceFile?: string; sourceItemId?: string },
): Promise<File> {
  let working = file;
  const newPathByIdentity = new Map<string, string>();
  let lastPathInFile: string | null = null;

  for (const slide of target) {
    if (slide.isNew && slide.duplicateFromPath) {
      const insertAfterPath =
        lastPathInFile !== null ? lastPathInFile : slide.insertAfterPath;
      const { file: next, newSlidePath } = await duplicateSlideInPptx(
        working,
        slide.duplicateFromPath,
        { insertAfterPath, blank: slide.blank },
      );
      working = next;
      newPathByIdentity.set(slideIdentity(slide), newSlidePath);
      lastPathInFile = newSlidePath;
    } else if (slide.slidePath) {
      lastPathInFile = slide.slidePath;
    }
  }

  const resolvePath = (s: EditableSlide) =>
    s.isNew ? newPathByIdentity.get(slideIdentity(s)) ?? '' : s.slidePath;

  const orderedPaths = target.map(resolvePath).filter(Boolean);
  const baselinePaths = new Set(baseline.filter((s) => !s.isNew).map((s) => s.slidePath));
  const keepPaths = new Set(orderedPaths);
  const deletePaths = [...baselinePaths].filter((p) => !keepPaths.has(p));

  working = await deleteSlidesFromPptx(working, deletePaths);
  working = await reorderSlidesInPptx(working, orderedPaths);

  const textSlides = target.map((s) => ({
    slidePath: resolvePath(s),
    title: s.title,
    snippet: s.snippet,
    editable: s.editable || s.blank,
    blank: s.blank,
  })).filter((s) => s.slidePath && (s.editable || s.blank));

  if (textSlides.length) {
    working = await applySlidesToPptx(working, textSlides, file.name);
  }

  working = await applyImageReplacementsToPptx(working, target);

  const bgTargets = target.filter((s) => {
    if (!s.slidePath) return false;
    if (s.backgroundReplacement) return true;
    const base = baseline.find(
      (b) => slideIdentity(b) === slideIdentity(s) || b.slidePath === s.slidePath,
    );
    if (!base) return s.backgroundKind === 'solid' && !!s.backgroundColor;
    return (
      s.backgroundKind !== base.backgroundKind ||
      (s.backgroundColor ?? '') !== (base.backgroundColor ?? '')
    );
  });
  if (bgTargets.length) {
    working = await applyBackgroundEditsToPptx(working, bgTargets);
  }

  return working;
}

/** 按 sourceItemId 分组应用幻灯片编辑（全部预览） */
export async function applyGroupedSlideEdits(
  items: { id: string; file: File; name: string; blobId: string }[],
  baseline: EditableSlide[],
  target: EditableSlide[],
  fetchPreviewPptx: FetchPreviewPptx,
): Promise<Map<string, File>> {
  const updates = new Map<string, File>();
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const groupByItem = (slides: EditableSlide[]) => {
    const groups = new Map<string, EditableSlide[]>();
    for (const s of slides) {
      const id = s.sourceItemId;
      if (!id) continue;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(s);
    }
    return groups;
  };

  const baseGroups = groupByItem(baseline);
  const targetGroups = groupByItem(target);

  for (const [itemId, targetSlides] of targetGroups) {
    const item = itemMap.get(itemId);
    if (!item) continue;
    const baseSlides = baseGroups.get(itemId) ?? [];
    if (slidesContentEqual(baseSlides, targetSlides)) continue;

    const workingFile = await resolveEditablePptxFile(
      item.file,
      item.name,
      item.blobId,
      fetchPreviewPptx,
    );
    const updated = await applySlideEditsToPptx(
      workingFile,
      baseSlides,
      targetSlides,
      { sourceFile: item.name, sourceItemId: itemId },
    );
    updates.set(itemId, updated);
  }

  return updates;
}

export function slideHasContent(slide: EditableSlide): boolean {
  return slide.imageUrls.length > 0 || slide.textLines.length > 0 || !!slide.isNew;
}

/** 在预览中插入的新页占位（保存时再写入 PPTX） */
export function createSlidePlaceholder(
  template: EditableSlide,
  options: { blank: boolean; insertAfterPath: string | null },
): EditableSlide {
  const duplicateFromPath =
    template.slidePath ||
    template.duplicateFromPath ||
    '';
  return {
    index: 0,
    slideInFile: 0,
    slidePath: '',
    isNew: true,
    clientId: crypto.randomUUID(),
    duplicateFromPath,
    insertAfterPath: options.insertAfterPath,
    blank: options.blank,
    sourceFile: template.sourceFile,
    sourceItemId: template.sourceItemId,
    title: options.blank ? '新幻灯片' : `${template.title}（副本）`,
    snippet: options.blank ? '' : template.snippet,
    textLines: options.blank ? [] : [...template.textLines],
    imageUrls: options.blank ? [] : [...template.imageUrls],
    imageMediaPaths: options.blank ? [] : [...template.imageMediaPaths],
    backgroundKind: options.blank ? 'none' : template.backgroundKind,
    backgroundMediaPath: options.blank ? undefined : template.backgroundMediaPath,
    backgroundColor: options.blank ? undefined : template.backgroundColor,
    backgroundPreviewUrl: options.blank ? undefined : template.backgroundPreviewUrl,
    editable: options.blank || template.editable,
  };
}
