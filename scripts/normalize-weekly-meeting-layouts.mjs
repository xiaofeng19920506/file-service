/**
 * 把本週聚会版式 B/C（P29/P30）的正文框几何与段落间距统一到版式 A（P28）。
 * 保留各版内容差异；字号可略小以保持每条聚会单行。
 */
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

const TPL = new URL('../shared/templates/bulletin/06_14_2026.pptx', import.meta.url);

function escapeXml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fontFace() {
  return `<a:latin typeface="Corbel"/><a:ea typeface="Corbel"/><a:cs typeface="Corbel"/><a:sym typeface="Corbel"/>`;
}

/** @param {{ text: string, sz: number, color?: string, highlight?: string, schemeHighlight?: string, italic?: boolean }} opts */
function run(opts) {
  const fill = opts.color
    ? `<a:solidFill><a:srgbClr val="${opts.color}"/></a:solidFill>`
    : '';
  const hl = opts.highlight
    ? `<a:highlight><a:srgbClr val="${opts.highlight}"/></a:highlight>`
    : opts.schemeHighlight
      ? `<a:highlight><a:schemeClr val="${opts.schemeHighlight}"/></a:highlight>`
      : '';
  const italic = opts.italic ? ' i="1"' : '';
  return `<a:r><a:rPr b="1"${italic} lang="en" sz="${opts.sz}">${fill}${hl}${fontFace()}</a:rPr><a:t>${escapeXml(opts.text)}</a:t></a:r>`;
}

function para(runsXml, { spcAft = 0, endSz = 2500 } = {}) {
  return `<a:p><a:pPr indent="0" lvl="0" marL="0" rtl="0" algn="l"><a:lnSpc><a:spcPct val="115000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="${spcAft}"/></a:spcAft><a:buNone/></a:pPr>${runsXml}<a:endParaRPr b="1" sz="${endSz}">${fontFace()}</a:endParaRPr></a:p>`;
}

const BODY_PR =
  `<a:bodyPr anchorCtr="0" anchor="t" bIns="91425" lIns="91425" spcFirstLastPara="1" rIns="91425" wrap="square" tIns="91425"><a:spAutoFit/></a:bodyPr><a:lstStyle/>`;

/** 版式 A 正文框位置 */
const BODY_OFF = { x: 0, y: 1356875 };
const BODY_EXT = { cx: 9144000, cy: 2419800 };

function bodyB() {
  // 週二 / 週三 与 A 同结构；週五用备注替换时间，字号略小保证单行
  const p0 = para(
    [
      run({ text: '週二  ', sz: 4300 }),
      run({ text: '查經班', sz: 4400 }),
      run({ text: '                       ', sz: 2500 }),
      run({ text: '晚上 8:30- 10:00', sz: 3000, color: '0000FF' }),
    ].join(''),
    { endSz: 3000 },
  );
  const p1 = para(
    [
      run({ text: '週三  禱告', sz: 4400 }),
      run({ text: '聚會                       ', sz: 3000 }),
      run({ text: '晚上 8:30- 10:00', sz: 3000, color: '0000FF' }),
    ].join(''),
  );
  const p2 = para(
    [
      run({ text: '週五  ', sz: 4400 }),
      run({ text: '細胞小家', sz: 4400 }),
      run({ text: '聚會  ', sz: 3000 }),
      run({ text: '本週暫停一次', sz: 2200, color: 'FF4D00' }),
      run({ text: '(每月第一與三週聚會)', sz: 1800, italic: true }),
    ].join(''),
    { spcAft: 1600, endSz: 1800 },
  );
  return `${BODY_PR}${p0}${p1}${p2}`;
}

function bodyC() {
  // 与 A 同字号层级与行距；中间「線上/教會」标签略小仍同排
  const p0 = para(
    [
      run({ text: '週二  ', sz: 4300 }),
      run({ text: '查經班', sz: 4400 }),
      run({ text: '          ', sz: 2500 }),
      run({ text: ' 線上 ', sz: 2800, schemeHighlight: 'accent6' }),
      run({ text: '    ', sz: 2500 }),
      run({ text: '晚上 8:30- 9:30', sz: 3000, color: '0000FF' }),
    ].join(''),
    { endSz: 3000 },
  );
  const p1 = para(
    [
      run({ text: '週三  ', sz: 4400 }),
      run({ text: '禱告會', sz: 4400 }),
      run({ text: '          ', sz: 2500 }),
      run({ text: ' 線上 ', sz: 2800, schemeHighlight: 'accent6' }),
      run({ text: '    ', sz: 2500 }),
      run({ text: '晚上 8:30- 10:00', sz: 3000, color: '0000FF' }),
    ].join(''),
  );
  const p2 = para(
    [
      run({ text: '週五  ', sz: 4400 }),
      run({ text: '通宵禱告會', sz: 4000 }),
      run({ text: '    ', sz: 2500 }),
      run({ text: ' 教會 ', sz: 2800, highlight: 'F6B26B' }),
      run({ text: '    ', sz: 2500 }),
      run({ text: '半夜 12:30開始', sz: 3000, color: '0000FF' }),
    ].join(''),
    { spcAft: 1600, endSz: 2600 },
  );
  return `${BODY_PR}${p0}${p1}${p2}`;
}

function replaceNthTxBody(slideXml, n, newInner) {
  let i = 0;
  return slideXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/g, (match) => {
    i += 1;
    if (i !== n) return match;
    return `<p:txBody>${newInner}</p:txBody>`;
  });
}

function setNthShapeBox(slideXml, n, off, ext) {
  let i = 0;
  return slideXml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (match) => {
    i += 1;
    if (i !== n) return match;
    let next = match.replace(
      /<a:off x="[^"]*" y="[^"]*"/,
      `<a:off x="${off.x}" y="${off.y}"`,
    );
    next = next.replace(
      /<a:ext cx="[^"]*" cy="[^"]*"/,
      `<a:ext cx="${ext.cx}" cy="${ext.cy}"`,
    );
    return next;
  });
}

const buf = await readFile(TPL);
const zip = await JSZip.loadAsync(buf);

for (const [slideNum, bodyInner] of [
  [29, bodyB()],
  [30, bodyC()],
]) {
  const path = `ppt/slides/slide${slideNum}.xml`;
  let xml = await zip.file(path).async('string');
  xml = setNthShapeBox(xml, 2, BODY_OFF, BODY_EXT);
  xml = replaceNthTxBody(xml, 2, bodyInner);
  zip.file(path, xml);
  console.log(`updated slide${slideNum}`);
}

const out = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
});
await writeFile(TPL, out);
console.log('wrote', TPL.pathname, out.length);
