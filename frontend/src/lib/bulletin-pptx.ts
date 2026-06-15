import type { WeeklyBulletin } from '../api/bulletins';
import {
  applySlidePatches,
  patchesFromBulletin,
  type SlideTextPatch,
} from './bulletin-pptx-patches';
import { deleteSlidesFromPptx } from './pptx-preview';

function slidePathForNumber(n: number): string {
  return `ppt/slides/slide${n}.xml`;
}

function slidesToDelete(bulletin: WeeklyBulletin): string[] {
  const paths: string[] = [];
  if (bulletin.skipTestimonyWeek) paths.push(slidePathForNumber(16));
  if (bulletin.skipDepartmentReports) paths.push(slidePathForNumber(36));
  const variants = [28, 29, 30];
  const keep = bulletin.weeklyMeetingVariant;
  for (const n of variants) {
    if (keep === null || n !== keep) paths.push(slidePathForNumber(n));
  }
  return paths;
}

export async function generateBulletinPptx(
  templateBlob: Blob,
  bulletin: WeeklyBulletin,
): Promise<File> {
  const patches: SlideTextPatch[] = patchesFromBulletin(bulletin);
  const filename = `bulletin-${bulletin.serviceDate}.pptx`;

  let file = await applySlidePatches(templateBlob, patches, filename);

  const deletePaths = slidesToDelete(bulletin);
  if (deletePaths.length) {
    file = await deleteSlidesFromPptx(file, deletePaths);
  }

  return file;
}
