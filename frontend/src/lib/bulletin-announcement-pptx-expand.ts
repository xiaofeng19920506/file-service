import type JSZip from 'jszip';
import JSZipCtor from './jszip';
import type { WeeklyBulletin } from '../api/bulletins';
import { applyIndexedTextReplacementsToSlideXml } from './pptx-preview';
import { duplicateSlideInZip } from './pptx-duplicate-slide';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const SLIDE25_PATH = 'ppt/slides/slide25.xml';
const SLIDE26_PATH = 'ppt/slides/slide26.xml';

type AnnouncementPageInput = { title?: string; body?: string };

function writeAnnouncementTitleBody(xml: string, item: AnnouncementPageInput): string {
  return applyIndexedTextReplacementsToSlideXml(xml, [
    { textIndex: 0, text: item.title?.trim() ? item.title.trim() : ' ' },
    { textIndex: 1, text: item.body?.trim() ? item.body.trim() : ' ' },
  ]);
}

/** 与 shared/bulletin-pptx-patch.applyAnnouncementPagesToZip 保持一致 */
async function applyAnnouncementPagesToZip(
  zip: JSZip,
  items: readonly AnnouncementPageInput[],
): Promise<void> {
  const pages = [...items];
  if (!pages.length) return;

  const slide25 = zip.file(SLIDE25_PATH);
  if (slide25) {
    const xml = await slide25.async('string');
    zip.file(SLIDE25_PATH, writeAnnouncementTitleBody(xml, pages[0]));
  }

  if (pages.length === 1) {
    const slide26 = zip.file(SLIDE26_PATH);
    if (slide26) {
      const xml = await slide26.async('string');
      zip.file(SLIDE26_PATH, writeAnnouncementTitleBody(xml, { title: ' ', body: ' ' }));
    }
    return;
  }

  const slide26 = zip.file(SLIDE26_PATH);
  if (slide26) {
    const xml = await slide26.async('string');
    zip.file(SLIDE26_PATH, writeAnnouncementTitleBody(xml, pages[1]));
  }

  let lastPath = SLIDE26_PATH;
  for (let i = 2; i < pages.length; i++) {
    lastPath = await duplicateSlideInZip(zip, SLIDE25_PATH, {
      insertAfterPath: lastPath,
    });
    const entry = zip.file(lastPath);
    if (!entry) continue;
    const xml = await entry.async('string');
    zip.file(lastPath, writeAnnouncementTitleBody(xml, pages[i]));
  }
}

/**
 * 发布路径公告加页：与预览共用同一套 duplicate + title/body 写入。
 * 前两页可能已由 applySlidePatches 写入；此处幂等重写并插入第 3+ 页。
 */
export async function expandAnnouncementSlidesInPptx(
  file: File,
  bulletin: WeeklyBulletin,
): Promise<File> {
  const items = bulletin.announcements ?? [];
  if (items.length <= 2) return file;

  const zip = await JSZipCtor.loadAsync(file);
  await applyAnnouncementPagesToZip(zip, items);
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], file.name, { type: PPTX_MIME });
}
