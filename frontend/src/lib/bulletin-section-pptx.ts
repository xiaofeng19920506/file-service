import { fetchBlobContent, uploadFile } from '../api/client';
import { updateBulletin, type WeeklyBulletin } from '../api/bulletins';
import {
  birthdayMonthOverrideKey,
  resolveBirthdayFields,
} from './bulletin-birthday-months';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from './bulletin-section-visibility';
import { navSectionById } from './bulletin-sections';
import {
  extractPresentationSlidesAsPptx,
} from './pptx-extract-slide';
import { pptxSlidesAreWellFormed } from './pptx-integrity';
import { listPptxSlidesInPresentationOrder } from './pptx-preview';
import { spliceSectionSlidesIntoPptx } from './pptx-splice-section';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** 与 shared `BULLETIN_SECTION_PPTX_APPEND_AFTER` 一致 */
export const SECTION_PPTX_APPEND_AFTER = new Set(['message']);

export function sectionPptxAppendsAfter(sectionId: string): boolean {
  return SECTION_PPTX_APPEND_AFTER.has(sectionId);
}

export function isPptxFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.pptx') || lower.endsWith('.ppt');
}

/**
 * 追加模式分区：编辑器应展示「模板锚点页 + 上传页」。
 * override 仅存上传段；保存时需再剥掉锚点页。
 */
export async function buildAppendSectionEditorPptx(opts: {
  anchorPptx: Blob;
  overridePptx: Blob | null;
  anchorSlideInFiles: readonly number[];
  fileName: string;
}): Promise<File> {
  const { anchorPptx, overridePptx, anchorSlideInFiles, fileName } = opts;
  if (!overridePptx) {
    return new File([anchorPptx], fileName, { type: PPTX_MIME });
  }
  const buf = await spliceSectionSlidesIntoPptx(anchorPptx, overridePptx, anchorSlideInFiles, {
    appendAfter: true,
  });
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new File([copy.buffer], fileName, { type: PPTX_MIME });
}

/** 从编辑器合并稿中去掉模板锚点页，得到应持久化的「仅追加段」 */
export async function stripAppendSectionAnchorSlides(
  combined: Blob,
  anchorSlideCount: number,
): Promise<File | null> {
  const order = await listPptxSlidesInPresentationOrder(combined);
  if (order.length <= anchorSlideCount) return null;
  const keep = order.slice(anchorSlideCount).map((s) => s.index);
  const bytes = await extractPresentationSlidesAsPptx(combined, keep);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], 'append.pptx', { type: PPTX_MIME });
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
    reuseExisting: true,
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
  let result: WeeklyBulletin = {
    ...updated,
    sectionPptxOverrides: updated.sectionPptxOverrides ?? nextOverrides,
  };

  // 自定义本週聚会模版：同步列表里的 blobId
  const templateId = draft.weeklyMeetingTemplateId?.trim();
  if (sectionId === 'weekly_meetings' && templateId) {
    const templates = (draft.weeklyMeetingTemplates ?? []).map((item) =>
      item.id === templateId ? { ...item, blobId: uploaded.blobId } : item,
    );
    if (templates.some((item) => item.id === templateId)) {
      result = await updateBulletin(draft.id, {
        weeklyMeetingTemplates: templates,
        weeklyMeetingTemplateId: templateId,
        sectionPptxOverrides: result.sectionPptxOverrides,
      });
      result = {
        ...result,
        weeklyMeetingTemplates: result.weeklyMeetingTemplates ?? templates,
        weeklyMeetingTemplateId: result.weeklyMeetingTemplateId ?? templateId,
      };
    }
  }

  return result;
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
