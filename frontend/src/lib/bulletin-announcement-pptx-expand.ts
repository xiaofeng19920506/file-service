import { applyAnnouncementPagesToZip } from '@file-service/shared';
import JSZipCtor from './jszip';
import type { WeeklyBulletin } from '../api/bulletins';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * 发布路径公告写入：与预览共用 shared.applyAnnouncementPagesToZip
 * （P25 版式、加高正文、第 2 页不再沿用「家有喜事」残留结构）。
 */
export async function expandAnnouncementSlidesInPptx(
  file: File,
  bulletin: WeeklyBulletin,
): Promise<File> {
  const items = bulletin.announcements ?? [];
  if (!items.length) return file;

  const zip = await JSZipCtor.loadAsync(file);
  await applyAnnouncementPagesToZip(zip, items);
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], file.name, { type: PPTX_MIME });
}
