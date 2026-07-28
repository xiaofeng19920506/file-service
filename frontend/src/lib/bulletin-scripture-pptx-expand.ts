import JSZip from './jszip';
import type { ScriptureSlideBodies } from '../api/bulletins';
import { applyScripturePagesToZip } from './bulletin-scripture-pptx-zip';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * 发布路径经文加页：复用与预览相同的 applyScripturePagesToZip，避免双路径漂移。
 * 首屏正文已由 applySlidePatches 写入；此处仅在有后续页时扩展。
 */
export async function expandScriptureSlidesInPptx(
  file: File,
  bodies: ScriptureSlideBodies,
): Promise<File> {
  const zhExtra = bodies.chinesePages.slice(1).filter((p) => p.trim());
  const enExtra = bodies.englishPages.slice(1).filter((p) => p.length);
  if (!zhExtra.length && !enExtra.length) return file;

  const zip = await JSZip.loadAsync(file);
  // 首屏已写入：仍走完整 apply，幂等重写第 1 页并插入后续页
  await applyScripturePagesToZip(zip, bodies.chinesePages, bodies.englishPages);
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], file.name, { type: PPTX_MIME });
}
