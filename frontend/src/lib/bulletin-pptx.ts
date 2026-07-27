import type { WeeklyBulletin } from '../api/bulletins';
import {
  applyBulletinPatches,
  applySlidePatches,
  buildBirthdaySlideReplacements,
  buildCoverPatch,
  bulletinDynamicTextOverrides,
  mergeSlideTextOverrides,
  patchesFromBulletin,
  type SlideTextPatch,
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

function formFieldReapplySkipFromSectionBlobs(sectionBlobs: Record<string, Blob> | undefined): {
  skipCover: boolean;
  skipPreService: boolean;
  skipBirthday: boolean;
  skipVerse: boolean;
  skipSlides: Set<number>;
} {
  const ids = new Set(Object.keys(sectionBlobs ?? {}));
  const formDriven = new Set(['cover', 'pre_service', 'birthday', 'verse_of_week', 'offering']);
  const skipSlides = new Set<number>();
  for (const sectionId of ids) {
    if (formDriven.has(sectionId)) continue;
    for (const slide of BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId] ?? []) {
      skipSlides.add(slide);
    }
  }
  return {
    skipCover: false,
    skipPreService: false,
    skipBirthday: false,
    skipVerse: false,
    skipSlides,
  };
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

    // splice 后只回写「未自定义」分区的表单字段，避免盖掉上传 PPT。
    const skip = formFieldReapplySkipFromSectionBlobs(sectionBlobs);
    const reapply: SlideTextPatch[] = [];
    if (bulletin.serviceDate && !skip.skipCover) {
      reapply.push(buildCoverPatch(bulletin.serviceDate, bulletin.serviceTime));
    }
    if (
      !skip.skipPreService &&
      bulletin.showPreServiceChairName &&
      bulletin.preServiceChairNames?.trim()
    ) {
      reapply.push({
        slideNumber: 2,
        replacements: [],
        preServiceChairName: bulletin.preServiceChairNames.trim(),
      });
    }
    const month = bulletin.birthdayMonth?.trim() ?? '';
    const names = bulletin.birthdayNames?.trim() ?? '';
    if (!skip.skipBirthday && (month || names)) {
      reapply.push({
        slideNumber: 24,
        replacements: buildBirthdaySlideReplacements(
          bulletin.birthdayMonth ?? '',
          bulletin.birthdayNames ?? '',
        ),
      });
    }
    if (!skip.skipVerse && bulletin.verseOfWeek?.trim()) {
      reapply.push({
        slideNumber: 35,
        replacements: [{ textIndex: 18, text: bulletin.verseOfWeek.trim() }],
      });
    }
    const overrides = mergeSlideTextOverrides(
      bulletinDynamicTextOverrides(bulletin),
      bulletin.slideTextOverrides,
    );
    for (const o of overrides) {
      if (skip.skipSlides.has(o.slide)) continue;
      reapply.push({
        slideNumber: o.slide,
        replacements: [{ textIndex: o.textIndex, text: o.text }],
      });
    }
    if (reapply.length) {
      file = await applySlidePatches(file, reapply, filename);
    }
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
