import JSZip from './jszip';
import { applyAnnouncementPagesToZip } from '@file-service/shared';
import type { WeeklyBulletin } from '../api/bulletins';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * 发布路径公告加页：与预览共用 applyAnnouncementPagesToZip。
 * 前两页可能已由 applySlidePatches 写入；此处幂等重写并插入第 3+ 页。
 */
export async function expandAnnouncementSlidesInPptx(
  file: File,
  bulletin: WeeklyBulletin,
): Promise<File> {
  const items = bulletin.announcements ?? [];
  if (items.length <= 2) return file;

  const zip = await JSZip.loadAsync(file);
  await applyAnnouncementPagesToZip(zip, items);
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], file.name, { type: PPTX_MIME });
}
