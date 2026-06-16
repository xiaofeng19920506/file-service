function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findShapeBlock(xml: string, shapeId: string): { start: number; end: number } | null {
  const marker = `<p:cNvPr id="${shapeId}"`;
  const idIdx = xml.indexOf(marker);
  if (idIdx < 0) return null;
  const start = xml.lastIndexOf('<p:sp>', idIdx);
  const endTag = xml.indexOf('</p:sp>', idIdx);
  if (start < 0 || endTag < 0) return null;
  return { start, end: endTag + '</p:sp>'.length };
}

function replaceShapeBlock(
  xml: string,
  shapeId: string,
  transform: (block: string) => string,
): string {
  const loc = findShapeBlock(xml, shapeId);
  if (!loc) return xml;
  const block = xml.slice(loc.start, loc.end);
  return xml.slice(0, loc.start) + transform(block) + xml.slice(loc.end);
}

const ZH_SHAPE_ID = '294';
const EN_SHAPE_ID = '299';

/** 中文经文 28pt（原模板 29pt，投影略小一号） */
const ZH_FONT_SZ = '2800';
/** 英文经文 22pt（原模板 18.5pt，投影加大两号） */
const EN_FONT_SZ = '2200';

function buildChineseTxBody(text: string): string {
  const paragraph = [
    '<a:p>',
    '<a:pPr indent="0" lvl="0" marL="0" rtl="0" algn="l">',
    '<a:spcBef><a:spcPts val="0"/></a:spcBef>',
    '<a:spcAft><a:spcPts val="0"/></a:spcAft>',
    '<a:buNone/>',
    '</a:pPr>',
    '<a:r>',
    '<a:rPr lang="en" sz="' + ZH_FONT_SZ + '">',
    '<a:solidFill><a:schemeClr val="dk2"/></a:solidFill>',
    '</a:rPr>',
    `<a:t>${escapeXml(text)}</a:t>`,
    '</a:r>',
    '<a:endParaRPr sz="' + ZH_FONT_SZ + '">',
    '<a:solidFill><a:schemeClr val="dk2"/></a:solidFill>',
    '</a:endParaRPr>',
    '</a:p>',
  ].join('');

  return [
    '<p:txBody>',
    '<a:bodyPr anchorCtr="0" anchor="t" bIns="91425" lIns="91425" spcFirstLastPara="1" rIns="91425" wrap="square" tIns="91425">',
    '<a:noAutofit/>',
    '</a:bodyPr>',
    '<a:lstStyle/>',
    paragraph,
    '</p:txBody>',
  ].join('');
}

function buildEnglishParagraph(line: string): string {
  return [
    '<a:p>',
    '<a:pPr indent="0" lvl="0" marL="0" rtl="0" algn="l">',
    '<a:spcBef><a:spcPts val="0"/></a:spcBef>',
    '<a:spcAft><a:spcPts val="0"/></a:spcAft>',
    '<a:buNone/>',
    '</a:pPr>',
    '<a:r>',
    '<a:rPr lang="en" sz="' + EN_FONT_SZ + '">',
    '<a:solidFill><a:schemeClr val="dk2"/></a:solidFill>',
    '</a:rPr>',
    `<a:t>${escapeXml(line)}</a:t>`,
    '</a:r>',
    '<a:endParaRPr sz="' + EN_FONT_SZ + '">',
    '<a:solidFill><a:schemeClr val="dk2"/></a:solidFill>',
    '</a:endParaRPr>',
    '</a:p>',
  ].join('');
}

function buildEnglishTxBody(lines: string[]): string {
  return [
    '<p:txBody>',
    '<a:bodyPr anchorCtr="0" anchor="t" bIns="91425" lIns="91425" spcFirstLastPara="1" rIns="91425" wrap="square" tIns="91425">',
    '<a:noAutofit/>',
    '</a:bodyPr>',
    '<a:lstStyle/>',
    lines.map(buildEnglishParagraph).join(''),
    '</p:txBody>',
  ].join('');
}

export function patchChineseScriptureBodyInSlideXml(xml: string, text: string): string {
  if (!text.trim()) return xml;
  const txBody = buildChineseTxBody(text);
  return replaceShapeBlock(xml, ZH_SHAPE_ID, (shapeXml) =>
    shapeXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, txBody),
  );
}

export function patchSlide6ScriptureBodyInSlideXml(
  xml: string,
  chineseText: string | null,
  englishLines: string[] | null,
): string {
  if (chineseText?.trim()) {
    const txBody = buildChineseTxBody(chineseText);
    return replaceShapeBlock(xml, EN_SHAPE_ID, (shapeXml) =>
      shapeXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, txBody),
    );
  }
  if (englishLines?.length) {
    const txBody = buildEnglishTxBody(englishLines);
    return replaceShapeBlock(xml, EN_SHAPE_ID, (shapeXml) =>
      shapeXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, txBody),
    );
  }
  return xml;
}
