import type JSZip from 'jszip';
import JSZipCtor from './jszip';
import type { WeeklyBulletin } from '../api/bulletins';
import { applyIndexedTextReplacementsToSlideXml } from './pptx-preview';
import { duplicateSlideInZip } from './pptx-duplicate-slide';
import { filterVisibleAnnouncements } from './bulletin-section-visibility';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const SLIDE25_PATH = 'ppt/slides/slide25.xml';

/** 与 shared/bulletin-pptx-patch 公告逻辑保持一致 */
const ANNOUNCEMENT_BODY_BOTTOM_EMU = 5_000_000;
const ANNOUNCEMENT_BODY_FONT_SZ = '2600';

type AnnouncementPageInput = { title?: string; body?: string };

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stabilizeAnnouncementSlideXml(xml: string): string {
  return xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (!/<a:bodyPr\b[^>]*\banchor="t"/.test(shapeXml)) return shapeXml;
    const ext = shapeXml.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    const off = shapeXml.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
    if (!ext || !off) return shapeXml;
    const cy = Number(ext[2]);
    if (cy < 2_000_000) return shapeXml;
    const y = Number(off[2]);
    const newCy = Math.max(cy, ANNOUNCEMENT_BODY_BOTTOM_EMU - y);
    let out = shapeXml.replace(/(<a:ext cx="\d+" )cy="\d+"\/>/, `$1cy="${newCy}"/>`);
    out = out.replace(/sz="3000"/g, `sz="${ANNOUNCEMENT_BODY_FONT_SZ}"`);
    return out;
  });
}

function buildAnnouncementBodyTxBody(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const paras = (lines.length ? lines : [' ']).map((line) => {
    const text = line.length ? line : ' ';
    return (
      `<a:p><a:pPr indent="0" lvl="0" marL="0" rtl="0" algn="l">` +
      `<a:spcBef><a:spcPts val="0"/></a:spcBef>` +
      `<a:spcAft><a:spcPts val="400"/></a:spcAft><a:buNone/></a:pPr>` +
      `<a:r><a:rPr lang="zh-CN" sz="${ANNOUNCEMENT_BODY_FONT_SZ}">` +
      `<a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:rPr>` +
      `<a:t>${escapeXml(text)}</a:t></a:r>` +
      `<a:endParaRPr sz="${ANNOUNCEMENT_BODY_FONT_SZ}">` +
      `<a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:endParaRPr></a:p>`
    );
  });
  return (
    `<p:txBody>` +
    `<a:bodyPr anchorCtr="0" anchor="t" bIns="91425" lIns="91425" spcFirstLastPara="1" rIns="91425" wrap="square" tIns="91425">` +
    `<a:noAutofit/></a:bodyPr><a:lstStyle/>` +
    paras.join('') +
    `</p:txBody>`
  );
}

function writeAnnouncementTitleBody(xml: string, item: AnnouncementPageInput): string {
  const title = item.title?.trim() ? item.title.trim() : ' ';
  const body = item.body?.trim() ? item.body.trim() : ' ';
  let out = applyIndexedTextReplacementsToSlideXml(xml, [{ textIndex: 0, text: title }]);
  out = out.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (!/<a:bodyPr\b[^>]*\banchor="t"/.test(shapeXml)) return shapeXml;
    const ext = shapeXml.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!ext || Number(ext[2]) < 2_000_000) return shapeXml;
    return shapeXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, buildAnnouncementBodyTxBody(body));
  });
  return out;
}

/**
 * 动态公告页：一律用 P25「标题+正文」版式。
 * 第 1 条写 P25；第 2 条起复制 P25（含 layout rels）。勿覆写模板 P26（layout12 → 黑屏）。
 */
export async function applyAnnouncementPagesToZip(
  zip: JSZip,
  items: readonly AnnouncementPageInput[],
): Promise<void> {
  const pages = [...items];
  if (!pages.length) return;

  const slide25 = zip.file(SLIDE25_PATH);
  if (!slide25) return;

  const layout = stabilizeAnnouncementSlideXml(await slide25.async('string'));
  zip.file(SLIDE25_PATH, writeAnnouncementTitleBody(layout, pages[0]!));

  let lastPath = SLIDE25_PATH;
  for (let i = 1; i < pages.length; i++) {
    lastPath = await duplicateSlideInZip(zip, SLIDE25_PATH, {
      insertAfterPath: lastPath,
    });
    const entry = zip.file(lastPath);
    if (!entry) continue;
    const xml = await entry.async('string');
    zip.file(lastPath, writeAnnouncementTitleBody(xml, pages[i]!));
  }
}

/**
 * 发布路径公告写入：按可见条数加页（调用方已过滤隐藏项）。
 */
export async function expandAnnouncementSlidesInPptx(
  file: File,
  bulletin: WeeklyBulletin,
): Promise<File> {
  const items = filterVisibleAnnouncements(bulletin.announcements, bulletin.hiddenSections);
  if (!items.length) return file;

  const zip = await JSZipCtor.loadAsync(file);
  await applyAnnouncementPagesToZip(zip, items);
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], file.name, { type: PPTX_MIME });
}
