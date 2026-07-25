/** 插入类操作：文本框、表格、艺术字、页码、日期、页脚、符号、超链接 */
import { aTextRegex, patchAllRunPr } from './text';
import {
  appendElement,
  escapeXml,
  findElementById,
  nextElementId,
  replaceElement,
  type BoxEmu,
  type SlideSize,
} from './xml';

const TABLE_STYLE_ID = '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}';

function guid(): string {
  const hex = crypto.randomUUID().toUpperCase();
  return `{${hex}}`;
}

function centeredBox(slideSize: SlideSize, widthRatio: number, heightRatio: number): BoxEmu {
  const cx = Math.round(slideSize.cx * widthRatio);
  const cy = Math.round(slideSize.cy * heightRatio);
  return {
    x: Math.round((slideSize.cx - cx) / 2),
    y: Math.round((slideSize.cy - cy) / 2),
    cx,
    cy,
  };
}

export function insertTextBox(
  slideXml: string,
  options: { slideSize: SlideSize; text: string; box?: BoxEmu; fontSizePt?: number },
): { xml: string; newId: number } {
  const id = nextElementId(slideXml);
  const box = options.box ?? centeredBox(options.slideSize, 0.4, 0.12);
  const sz = Math.round((options.fontSizePt ?? 18) * 100);

  const sp =
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="文本框 ${id}"/>` +
    `<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:r><a:rPr lang="zh-CN" altLang="en-US" sz="${sz}" dirty="0"/><a:t>${escapeXml(options.text)}</a:t></a:r>` +
    `<a:endParaRPr lang="zh-CN" altLang="en-US" sz="${sz}" dirty="0"/></a:p></p:txBody></p:sp>`;

  return { xml: appendElement(slideXml, sp), newId: id };
}

export function insertWordArt(
  slideXml: string,
  options: { slideSize: SlideSize; text: string },
): { xml: string; newId: number } {
  const id = nextElementId(slideXml);
  const box = centeredBox(options.slideSize, 0.5, 0.16);

  const sp =
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="艺术字 ${id}"/>` +
    `<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="none" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr"/><a:r>` +
    `<a:rPr lang="zh-CN" altLang="en-US" sz="4000" b="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="4472C4"/></a:solidFill>` +
    `<a:effectLst><a:outerShdw blurRad="38100" dist="38100" dir="2700000" algn="tl" rotWithShape="0">` +
    `<a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw></a:effectLst>` +
    `<a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/>` +
    `</a:rPr><a:t>${escapeXml(options.text)}</a:t></a:r></a:p></p:txBody></p:sp>`;

  return { xml: appendElement(slideXml, sp), newId: id };
}

/**
 * 单元格边框与填充写成显式的：只挂 tableStyleId 时，模板里没有该样式定义的渲染器
 * （LibreOffice、以及我们自己的画布）会画出完全透明的表格。
 */
function tcPr(headerRow: boolean): string {
  const line = (tag: string) =>
    `<a:${tag} w="12700" cap="flat" cmpd="sng" algn="ctr">` +
    `<a:solidFill><a:srgbClr val="8EAADB"/></a:solidFill><a:prstDash val="solid"/>` +
    `</a:${tag}>`;
  const fill = headerRow
    ? '<a:solidFill><a:srgbClr val="4472C4"/></a:solidFill>'
    : '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>';
  return (
    `<a:tcPr marL="91440" marR="91440" marT="45720" marB="45720" anchor="ctr">` +
    `${line('lnL')}${line('lnR')}${line('lnT')}${line('lnB')}${fill}</a:tcPr>`
  );
}

export function insertTable(
  slideXml: string,
  options: { slideSize: SlideSize; rows: number; cols: number },
): { xml: string; newId: number } {
  const id = nextElementId(slideXml);
  const rows = Math.max(1, Math.min(30, options.rows));
  const cols = Math.max(1, Math.min(20, options.cols));
  const box = centeredBox(options.slideSize, 0.72, Math.min(0.7, 0.09 * rows));

  const colWidth = Math.floor(box.cx / cols);
  const rowHeight = Math.floor(box.cy / rows);
  const grid = Array.from({ length: cols }, () => `<a:gridCol w="${colWidth}"/>`).join('');

  const cell = (headerRow: boolean) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/>` +
    `<a:endParaRPr lang="zh-CN" altLang="en-US" sz="1400"${headerRow ? ' b="1"' : ''}/>` +
    `</a:p></a:txBody>${tcPr(headerRow)}</a:tc>`;

  const trs = Array.from(
    { length: rows },
    (_v, r) => `<a:tr h="${rowHeight}">${cell(r === 0).repeat(cols)}</a:tr>`,
  ).join('');

  const frame =
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="表格 ${id}"/>` +
    `<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">` +
    `<a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>${TABLE_STYLE_ID}</a:tableStyleId></a:tblPr>` +
    `<a:tblGrid>${grid}</a:tblGrid>${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;

  return { xml: appendElement(slideXml, frame), newId: id };
}

function fieldTextBox(
  slideXml: string,
  options: {
    slideSize: SlideSize;
    name: string;
    fieldType: string;
    placeholder: string;
    box: BoxEmu;
    align: 'l' | 'ctr' | 'r';
  },
): { xml: string; newId: number } {
  const id = nextElementId(slideXml);
  const { box } = options;

  const sp =
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(options.name)} ${id}"/>` +
    `<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="ctr"/><a:lstStyle/>` +
    `<a:p><a:pPr algn="${options.align}"/>` +
    `<a:fld id="${guid()}" type="${options.fieldType}"><a:rPr lang="zh-CN" altLang="en-US" sz="1200"/>` +
    `<a:t>${escapeXml(options.placeholder)}</a:t></a:fld>` +
    `<a:endParaRPr lang="zh-CN" altLang="en-US" sz="1200"/></a:p></p:txBody></p:sp>`;

  return { xml: appendElement(slideXml, sp), newId: id };
}

export function insertSlideNumber(
  slideXml: string,
  slideSize: SlideSize,
): { xml: string; newId: number } {
  const cx = Math.round(slideSize.cx * 0.1);
  const cy = Math.round(slideSize.cy * 0.06);
  return fieldTextBox(slideXml, {
    slideSize,
    name: '幻灯片编号占位符',
    fieldType: 'slidenum',
    placeholder: '‹#›',
    align: 'r',
    box: {
      x: slideSize.cx - cx - Math.round(slideSize.cx * 0.03),
      y: slideSize.cy - cy - Math.round(slideSize.cy * 0.03),
      cx,
      cy,
    },
  });
}

export function insertDateTime(
  slideXml: string,
  slideSize: SlideSize,
  placeholder: string,
): { xml: string; newId: number } {
  const cx = Math.round(slideSize.cx * 0.22);
  const cy = Math.round(slideSize.cy * 0.06);
  return fieldTextBox(slideXml, {
    slideSize,
    name: '日期占位符',
    fieldType: 'datetime1',
    placeholder,
    align: 'l',
    box: {
      x: Math.round(slideSize.cx * 0.03),
      y: slideSize.cy - cy - Math.round(slideSize.cy * 0.03),
      cx,
      cy,
    },
  });
}

/** 页脚文本框（页眉页脚命令在 PPT 中实际写入页脚占位符） */
export function insertFooter(
  slideXml: string,
  slideSize: SlideSize,
  text: string,
): { xml: string; newId: number } {
  const id = nextElementId(slideXml);
  const cx = Math.round(slideSize.cx * 0.4);
  const cy = Math.round(slideSize.cy * 0.06);
  const box: BoxEmu = {
    x: Math.round((slideSize.cx - cx) / 2),
    y: slideSize.cy - cy - Math.round(slideSize.cy * 0.03),
    cx,
    cy,
  };

  const sp =
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="页脚占位符 ${id}"/>` +
    `<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="ctr"/><a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="zh-CN" altLang="en-US" sz="1200"/>` +
    `<a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;

  return { xml: appendElement(slideXml, sp), newId: id };
}

/** 在元素最后一个 run 末尾追加字符（符号插入） */
export function appendCharToElement(
  slideXml: string,
  elementId: number,
  char: string,
): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;

  const matches = [...el.xml.matchAll(aTextRegex())];
  const last = matches[matches.length - 1];
  if (!last || last.index == null) {
    const p = el.xml.lastIndexOf('</a:p>');
    if (p < 0) return slideXml;
    const run = `<a:r><a:rPr lang="zh-CN" altLang="en-US"/><a:t>${escapeXml(char)}</a:t></a:r>`;
    return replaceElement(slideXml, el, el.xml.slice(0, p) + run + el.xml.slice(p));
  }

  const insertAt = last.index + last[1].length + last[2].length;
  const next = el.xml.slice(0, insertAt) + escapeXml(char) + el.xml.slice(insertAt);
  return replaceElement(slideXml, el, next);
}

/** 给元素内所有 run 挂上超链接（rId 需先写进 slide rels） */
export function applyHyperlink(
  slideXml: string,
  elementId: number,
  relId: string,
): string {
  const el = findElementById(slideXml, elementId);
  if (!el) return slideXml;
  const at = el.xml.indexOf('<p:txBody>');
  const to = el.xml.lastIndexOf('</p:txBody>');
  if (at < 0 || to < 0) return slideXml;
  const bodyEnd = to + '</p:txBody>'.length;
  const nextBody = patchAllRunPr(el.xml.slice(at, bodyEnd), { hyperlinkRelId: relId });
  return replaceElement(slideXml, el, el.xml.slice(0, at) + nextBody + el.xml.slice(bodyEnd));
}
