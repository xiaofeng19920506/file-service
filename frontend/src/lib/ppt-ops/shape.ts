/** 形状级操作：几何、填充轮廓、层级、对齐分布、增删复制 */
import { parsePr, serializePr } from './pr';
import { aTextRegex, unescapeXml } from './text';
import {
  appendElement,
  escapeXml,
  findElementById,
  listElements,
  nextElementId,
  readBox,
  removeElement,
  replaceElement,
  writeBox,
  type BoxEmu,
  type SlideElement,
  type SlideSize,
} from './xml';

const SPPR_ORDER = [
  'a:xfrm',
  'a:custGeom',
  'a:prstGeom',
  'a:noFill',
  'a:solidFill',
  'a:gradFill',
  'a:blipFill',
  'a:pattFill',
  'a:grpFill',
  'a:ln',
  'a:effectLst',
  'a:effectDag',
  'a:scene3d',
  'a:sp3d',
  'a:extLst',
];

const FILL_TAGS = ['a:noFill', 'a:solidFill', 'a:gradFill', 'a:blipFill', 'a:pattFill', 'a:grpFill'];

export type ShapePreset =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star5'
  | 'rightArrow'
  | 'leftArrow'
  | 'upArrow'
  | 'downArrow'
  | 'line'
  | 'straightConnector'
  | 'callout';

const PRESET_GEOM: Record<ShapePreset, string> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  star5: 'star5',
  rightArrow: 'rightArrow',
  leftArrow: 'leftArrow',
  upArrow: 'upArrow',
  downArrow: 'downArrow',
  line: 'line',
  straightConnector: 'straightConnector1',
  callout: 'wedgeRectCallout',
};

function isLineLike(preset: ShapePreset): boolean {
  return preset === 'line' || preset === 'straightConnector';
}

function normalizeHex(color: string): string {
  return color.replace('#', '').toUpperCase().slice(0, 6);
}

function rewriteSpPr(elementXml: string, mutate: (pr: ReturnType<typeof parsePr>) => void): string {
  const open = /<p:spPr((?:"[^"]*"|[^>"])*?)(\/?)>/.exec(elementXml);
  if (!open || open.index == null) return elementXml;
  const start = open.index;
  let end: number;
  if (open[2] === '/') {
    end = start + open[0].length;
  } else {
    const close = elementXml.indexOf('</p:spPr>', start);
    if (close < 0) return elementXml;
    end = close + '</p:spPr>'.length;
  }
  const pr = parsePr(elementXml.slice(start, end), 'p:spPr', SPPR_ORDER);
  mutate(pr);
  return elementXml.slice(0, start) + serializePr(pr, 'p:spPr', SPPR_ORDER) + elementXml.slice(end);
}

/** 形状填充；hex 为 null 表示无填充 */
export function setShapeFill(slideXml: string, elementId: number, hex: string | null): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const next = rewriteSpPr(el.xml, (pr) => {
    for (const tag of FILL_TAGS) pr.children.delete(tag);
    if (hex === null) pr.children.set('a:noFill', '<a:noFill/>');
    else pr.children.set('a:solidFill', `<a:solidFill><a:srgbClr val="${normalizeHex(hex)}"/></a:solidFill>`);
  });
  return replaceElement(slideXml, el, next);
}

/** 形状轮廓颜色；hex 为 null 表示无轮廓 */
export function setShapeLine(slideXml: string, elementId: number, hex: string | null): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const next = rewriteSpPr(el.xml, (pr) => {
    const existing = pr.children.get('a:ln') ?? '<a:ln/>';
    const width = existing.match(/\sw="(\d+)"/)?.[1];
    const widthAttr = width ? ` w="${width}"` : '';
    pr.children.set(
      'a:ln',
      hex === null
        ? `<a:ln${widthAttr}><a:noFill/></a:ln>`
        : `<a:ln${widthAttr}><a:solidFill><a:srgbClr val="${normalizeHex(hex)}"/></a:solidFill></a:ln>`,
    );
  });
  return replaceElement(slideXml, el, next);
}

export function setShapeLineWidth(slideXml: string, elementId: number, pt: number): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const emu = Math.max(0, Math.round(pt * 12700));
  const next = rewriteSpPr(el.xml, (pr) => {
    const existing = pr.children.get('a:ln');
    if (!existing) {
      pr.children.set('a:ln', `<a:ln w="${emu}"/>`);
      return;
    }
    pr.children.set(
      'a:ln',
      /\sw="\d+"/.test(existing)
        ? existing.replace(/\sw="\d+"/, ` w="${emu}"`)
        : existing.replace(/^<a:ln/, `<a:ln w="${emu}"`),
    );
  });
  return replaceElement(slideXml, el, next);
}

/** 读取形状填充与轮廓，用于 Ribbon 回显 */
export function readShapeFormat(elementXml: string): {
  fill: string | null;
  line: string | null;
} {
  const spPr = elementXml.match(/<p:spPr[\s\S]*?<\/p:spPr>/)?.[0] ?? '';
  const lnBlock = spPr.match(/<a:ln[^>]*>[\s\S]*?<\/a:ln>/)?.[0] ?? '';
  const outsideLn = spPr.replace(lnBlock, '');
  const fill = outsideLn.match(/<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1];
  const line = lnBlock.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1];
  return {
    fill: fill ? `#${fill.toUpperCase()}` : null,
    line: line ? `#${line.toUpperCase()}` : null,
  };
}

export function moveElement(
  slideXml: string,
  elementId: number,
  dx: number,
  dy: number,
  slideSize: SlideSize,
): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const box = readBox(el.xml);
  if (!box) return slideXml;
  const next = writeBox(el.xml, {
    ...box,
    x: Math.max(-box.cx / 2, Math.min(slideSize.cx - box.cx / 2, box.x + dx)),
    y: Math.max(-box.cy / 2, Math.min(slideSize.cy - box.cy / 2, box.y + dy)),
  });
  return replaceElement(slideXml, el, next);
}

export function setElementBox(slideXml: string, elementId: number, box: BoxEmu): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  return replaceElement(slideXml, el, writeBox(el.xml, box));
}

export type OrderAction = 'front' | 'back' | 'forward' | 'backward';

export function reorderElement(
  slideXml: string,
  elementId: number,
  action: OrderAction,
): string {
  const elements = listElements(slideXml);
  const index = elements.findIndex((e) => e.id === elementId);
  if (index < 0 || elements.length < 2) return slideXml;

  const target =
    action === 'front'
      ? elements.length - 1
      : action === 'back'
        ? 0
        : action === 'forward'
          ? Math.min(elements.length - 1, index + 1)
          : Math.max(0, index - 1);
  if (target === index) return slideXml;

  const ordered = [...elements];
  const [moving] = ordered.splice(index, 1);
  ordered.splice(target, 0, moving);

  const first = elements[0];
  const last = elements[elements.length - 1];
  return (
    slideXml.slice(0, first.start) +
    ordered.map((e) => e.xml).join('') +
    slideXml.slice(last.end)
  );
}

export type AlignAction =
  | 'left'
  | 'centerH'
  | 'right'
  | 'top'
  | 'middleV'
  | 'bottom'
  | 'distributeH'
  | 'distributeV';

/** 单个对象时相对幻灯片对齐（与 PPT 行为一致） */
export function alignElement(
  slideXml: string,
  elementId: number,
  action: AlignAction,
  slideSize: SlideSize,
): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const box = readBox(el.xml);
  if (!box) return slideXml;

  const next = { ...box };
  switch (action) {
    case 'left':
      next.x = 0;
      break;
    case 'centerH':
    case 'distributeH':
      next.x = Math.round((slideSize.cx - box.cx) / 2);
      break;
    case 'right':
      next.x = slideSize.cx - box.cx;
      break;
    case 'top':
      next.y = 0;
      break;
    case 'middleV':
    case 'distributeV':
      next.y = Math.round((slideSize.cy - box.cy) / 2);
      break;
    case 'bottom':
      next.y = slideSize.cy - box.cy;
      break;
  }
  return replaceElement(slideXml, el, writeBox(el.xml, next));
}

export function deleteElement(slideXml: string, elementId: number): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  return removeElement(slideXml, el);
}

const DUPLICATE_OFFSET_EMU = 228600; // 0.25 英寸

/** 把一段元素 xml 重编 id 后贴到当前页 */
export function pasteElementXml(
  slideXml: string,
  elementXml: string,
  nameSuffix: string,
  offset = DUPLICATE_OFFSET_EMU,
): { xml: string; newId: number } {
  let nextId = nextElementId(slideXml);
  const newId = nextId;

  let clone = elementXml.replace(/<p:cNvPr([^>]*)\sid="\d+"/g, (_full, pre: string) => {
    const assigned = nextId;
    nextId += 1;
    return `<p:cNvPr${pre} id="${assigned}"`;
  });
  clone = clone.replace(
    /<p:cNvPr([^>]*)\sname="([^"]*)"/,
    (_full, pre: string, name: string) => `<p:cNvPr${pre} name="${escapeXml(`${name} ${nameSuffix}`)}"`,
  );

  const box = readBox(clone);
  if (box && offset) {
    clone = writeBox(clone, { ...box, x: box.x + offset, y: box.y + offset });
  }

  return { xml: appendElement(slideXml, clone), newId };
}

/** 复制元素并重编 id，返回新 xml 与新元素 id */
export function duplicateElement(
  slideXml: string,
  elementId: number,
  nameSuffix: string,
): { xml: string; newId: number } | null {
  const el = findElementById(slideXml, elementId);
  if (!el) return null;
  return pasteElementXml(slideXml, el.xml, nameSuffix);
}

/** 取出元素 xml（复制到剪贴板用） */
export function readElementXml(slideXml: string, elementId: number): string | null {
  return findElementById(slideXml, elementId)?.xml ?? null;
}

export type InsertShapeOptions = {
  preset: ShapePreset;
  slideSize: SlideSize;
  fill?: string;
  line?: string;
  box?: BoxEmu;
};

/** 在页面中心插入一个形状，返回新 xml 与新元素 id */
export function insertShape(
  slideXml: string,
  options: InsertShapeOptions,
): { xml: string; newId: number } {
  const { preset, slideSize } = options;
  const id = nextElementId(slideXml);
  const cx = options.box?.cx ?? Math.round(slideSize.cx * 0.25);
  const cy = options.box?.cy ?? (isLineLike(preset) ? 0 : Math.round(slideSize.cy * 0.2));
  const x = options.box?.x ?? Math.round((slideSize.cx - cx) / 2);
  const y = options.box?.y ?? Math.round((slideSize.cy - cy) / 2);

  const geom = PRESET_GEOM[preset];
  const fill = isLineLike(preset)
    ? '<a:noFill/>'
    : `<a:solidFill><a:srgbClr val="${normalizeHex(options.fill ?? '#4472C4')}"/></a:solidFill>`;
  const lineHex = normalizeHex(options.line ?? (isLineLike(preset) ? '#000000' : '#2F528F'));
  const ln = `<a:ln w="${isLineLike(preset) ? 19050 : 12700}"><a:solidFill><a:srgbClr val="${lineHex}"/></a:solidFill>${
    preset === 'straightConnector' ? '<a:tailEnd type="triangle"/>' : ''
  }</a:ln>`;

  const body = isLineLike(preset)
    ? ''
    : `<p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:endParaRPr lang="zh-CN" sz="1800"/></a:p></p:txBody>`;

  const sp =
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(geom)} ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fill}${ln}</p:spPr>${body}</p:sp>`;

  return { xml: appendElement(slideXml, sp), newId: id };
}

/** 元素摘要，用于「选择窗格」 */
export function describeElements(slideXml: string): {
  id: number;
  tag: SlideElement['tag'];
  name: string;
  hasText: boolean;
  text: string;
}[] {
  return listElements(slideXml)
    .filter((el) => el.id != null)
    .map((el) => ({
      id: el.id!,
      tag: el.tag,
      name: el.name,
      hasText: el.xml.includes('<p:txBody>'),
      text: [...el.xml.matchAll(aTextRegex())]
        .map((m) => unescapeXml(m[2]))
        .join('')
        .slice(0, 40),
    }));
}
