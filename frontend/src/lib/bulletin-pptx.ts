import type { WeeklyBulletin } from '../api/bulletins';
import {
  applyBulletinPatches,
  patchesFromBulletin,
} from './bulletin-pptx-patches';
import { bulletinSlidePathsToDelete } from './bulletin-section-visibility';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from './bulletin-section-visibility';
import { deleteSlidesFromPptx } from './pptx-preview';
import { spliceAllSectionOverridesIntoPptx } from './pptx-splice-section';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function slidesToDelete(bulletin: WeeklyBulletin): string[] {
  return bulletinSlidePathsToDelete(bulletin);
}

export async function generateBulletinPptx(
  templateBlob: Blob,
  bulletin: WeeklyBulletin,
  sectionBlobs?: Record<string, Blob>,
): Promise<File> {
  const { patches, scriptureBodies } = await patchesFromBulletin(bulletin);
  const filename = `bulletin-${bulletin.serviceDate}.pptx`;

  let file = await applyBulletinPatches(templateBlob, patches, scriptureBodies, filename);

  const deletePaths = slidesToDelete(bulletin);
  if (deletePaths.length) {
    file = await deleteSlidesFromPptx(file, deletePaths);
  }

  const sections: { slideInFiles: readonly number[]; miniPptx: Blob }[] = [];
  for (const [sectionId, mini] of Object.entries(sectionBlobs ?? {})) {
    const slideInFiles = BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId];
    if (!slideInFiles?.length || !mini) continue;
    sections.push({ slideInFiles, miniPptx: mini });
  }
  if (sections.length) {
    const buf = await spliceAllSectionOverridesIntoPptx(file, sections);
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    file = new File([copy.buffer], filename, { type: PPTX_MIME });
  }

  return file;
}

/**
 * 分区编辑用：只打字段补丁，不删「始终省略」页，便于按模板文件号抽出完整原页。
 */
export async function buildPatchedBulletinForSectionExtract(
  templateBlob: Blob,
  bulletin: WeeklyBulletin,
): Promise<File> {
  const { patches, scriptureBodies } = await patchesFromBulletin(bulletin);
  const filename = `bulletin-section-source-${bulletin.serviceDate}.pptx`;
  return applyBulletinPatches(templateBlob, patches, scriptureBodies, filename);
}
