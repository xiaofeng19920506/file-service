import type { WeeklyBulletin } from '../api/bulletins';
import {
  applyBulletinPatches,
  patchesFromBulletin,
} from './bulletin-pptx-patches';
import { bulletinSlidePathsToDelete } from './bulletin-section-visibility';
import { deleteSlidesFromPptx } from './pptx-preview';

export function slidesToDelete(bulletin: WeeklyBulletin): string[] {
  return bulletinSlidePathsToDelete(bulletin);
}

export async function generateBulletinPptx(
  templateBlob: Blob,
  bulletin: WeeklyBulletin,
): Promise<File> {
  const { patches, scriptureBodies } = await patchesFromBulletin(bulletin);
  const filename = `bulletin-${bulletin.serviceDate}.pptx`;

  let file = await applyBulletinPatches(templateBlob, patches, scriptureBodies, filename);

  const deletePaths = slidesToDelete(bulletin);
  if (deletePaths.length) {
    file = await deleteSlidesFromPptx(file, deletePaths);
  }

  return file;
}
