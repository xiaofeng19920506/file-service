import { fetchBlobContent, uploadFile } from '../api/client';
import { updateBulletin, type WeeklyBulletin } from '../api/bulletins';
import {
  birthdayMonthOverrideKey,
  resolveBirthdayFields,
} from './bulletin-birthday-months';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from './bulletin-section-visibility';
import { navSectionById } from './bulletin-sections';
import { pptxSlidesAreWellFormed } from './pptx-integrity';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function isPptxFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.pptx') || lower.endsWith('.ppt');
}

/** 把本机 PPTX 存为分区整段覆盖（预览/导出会 splice 进周报） */
export async function replaceBulletinSectionPptx(
  draft: WeeklyBulletin,
  sectionId: string,
  file: File,
  sectionLabel: string,
): Promise<WeeklyBulletin> {
  if (!BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId]?.length) {
    throw new Error('section_has_no_slides');
  }
  if (!isPptxFileName(file.name)) {
    throw new Error('invalid_pptx');
  }
  if (!(await pptxSlidesAreWellFormed(file))) {
    throw new Error('invalid_pptx');
  }

  const downloadName = `周报-${draft.serviceDate}-${sectionLabel}.pptx`;
  const named = new File([file], downloadName, { type: PPTX_MIME });
  const uploaded = await uploadFile(named, {
    title: `周报分区 ${sectionLabel} ${draft.serviceDate}`,
    notes: `bulletin section pptx ${draft.id} ${sectionId}`,
  });

  let nextOverrides = {
    ...(draft.sectionPptxOverrides ?? {}),
    [sectionId]: uploaded.blobId,
  };
  if (sectionId === 'birthday') {
    const { month } = resolveBirthdayFields({
      birthdayMonth: draft.birthdayMonth,
      birthdayNames: draft.birthdayNames,
      serviceDate: draft.serviceDate,
    });
    nextOverrides = {
      ...nextOverrides,
      [birthdayMonthOverrideKey(month)]: uploaded.blobId,
      birthday: uploaded.blobId,
    };
  }

  const updated = await updateBulletin(draft.id, { sectionPptxOverrides: nextOverrides });
  return {
    ...updated,
    sectionPptxOverrides: updated.sectionPptxOverrides ?? nextOverrides,
  };
}

export async function clearBulletinSectionPptx(
  draft: WeeklyBulletin,
  sectionId: string,
): Promise<WeeklyBulletin> {
  const nextOverrides = { ...(draft.sectionPptxOverrides ?? {}) };
  delete nextOverrides[sectionId];
  if (sectionId === 'birthday') {
    const { month } = resolveBirthdayFields({
      birthdayMonth: draft.birthdayMonth,
      birthdayNames: draft.birthdayNames,
      serviceDate: draft.serviceDate,
    });
    delete nextOverrides[birthdayMonthOverrideKey(month)];
    delete nextOverrides.birthday;
  }
  const updated = await updateBulletin(draft.id, { sectionPptxOverrides: nextOverrides });
  return {
    ...updated,
    sectionPptxOverrides: updated.sectionPptxOverrides ?? nextOverrides,
  };
}

export async function downloadBulletinSectionPptxBlob(
  draft: WeeklyBulletin,
  sectionId: string,
): Promise<Blob | null> {
  const blobId = draft.sectionPptxOverrides?.[sectionId];
  if (!blobId) return null;
  return fetchBlobContent(blobId);
}

export function bulletinSectionLabel(
  sectionId: string,
  t: (key: string) => string,
): string {
  const meta = navSectionById(sectionId);
  return meta ? t(meta.labelKey) : sectionId;
}
