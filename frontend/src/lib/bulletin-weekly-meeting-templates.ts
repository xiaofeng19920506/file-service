import { fetchBlobContent, uploadFile } from '../api/client';
import { updateBulletin, type WeeklyBulletin } from '../api/bulletins';
import { isPptxFileName } from './bulletin-section-pptx';
import { pptxSlidesAreWellFormed } from './pptx-integrity';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type WeeklyMeetingTemplate = {
  id: string;
  label: string;
  blobId: string;
};

export type WeeklyMeetingSelectionPatch = Pick<
  WeeklyBulletin,
  | 'weeklyMeetingVariant'
  | 'weeklyMeetingTemplateId'
  | 'weeklyMeetingTemplates'
  | 'sectionPptxOverrides'
>;

function withWeeklyMeetingsOverride(
  overrides: Record<string, string> | null | undefined,
  blobId: string | null,
): Record<string, string> {
  const next = { ...(overrides ?? {}) };
  if (!blobId) delete next.weekly_meetings;
  else next.weekly_meetings = blobId;
  return next;
}

/** 选内置 A/B/C：清自定义 id，并去掉 weekly_meetings 分区覆盖 */
export function selectBuiltinWeeklyMeeting(
  draft: WeeklyBulletin,
  variant: 28 | 29 | 30,
): WeeklyMeetingSelectionPatch {
  return {
    weeklyMeetingVariant: variant,
    weeklyMeetingTemplateId: null,
    weeklyMeetingTemplates: draft.weeklyMeetingTemplates ?? [],
    sectionPptxOverrides: withWeeklyMeetingsOverride(draft.sectionPptxOverrides, null),
  };
}

/** 选自定义模版：写入 templateId，并用其 blob 覆盖 weekly_meetings */
export function selectCustomWeeklyMeeting(
  draft: WeeklyBulletin,
  templateId: string,
): WeeklyMeetingSelectionPatch | null {
  const templates = draft.weeklyMeetingTemplates ?? [];
  const hit = templates.find((t) => t.id === templateId);
  if (!hit) return null;
  return {
    weeklyMeetingVariant: draft.weeklyMeetingVariant ?? 28,
    weeklyMeetingTemplateId: hit.id,
    weeklyMeetingTemplates: templates,
    sectionPptxOverrides: withWeeklyMeetingsOverride(draft.sectionPptxOverrides, hit.blobId),
  };
}

/** 上传 PPTX 并追加为自定义模版，同时选中它 */
export async function addWeeklyMeetingTemplate(
  draft: WeeklyBulletin,
  file: File,
): Promise<WeeklyBulletin> {
  if (!isPptxFileName(file.name)) {
    throw new Error('invalid_pptx');
  }
  if (!(await pptxSlidesAreWellFormed(file))) {
    throw new Error('invalid_pptx');
  }

  const baseLabel = file.name.replace(/\.(pptx|ppt)$/i, '').trim() || '自定义模版';
  const downloadName = `周报-${draft.serviceDate}-本週聚会-${baseLabel}.pptx`;
  const named = new File([file], downloadName, { type: PPTX_MIME });
  const uploaded = await uploadFile(named, {
    title: `周报本週聚会 ${baseLabel} ${draft.serviceDate}`,
    notes: `bulletin weekly meeting template ${draft.id}`,
  });

  const template: WeeklyMeetingTemplate = {
    id: crypto.randomUUID(),
    label: baseLabel,
    blobId: uploaded.blobId,
  };
  const templates = [...(draft.weeklyMeetingTemplates ?? []), template];
  const overrides = withWeeklyMeetingsOverride(draft.sectionPptxOverrides, template.blobId);

  const updated = await updateBulletin(draft.id, {
    weeklyMeetingTemplates: templates,
    weeklyMeetingTemplateId: template.id,
    weeklyMeetingVariant: draft.weeklyMeetingVariant ?? 28,
    sectionPptxOverrides: overrides,
  });
  return {
    ...updated,
    weeklyMeetingTemplates: updated.weeklyMeetingTemplates ?? templates,
    weeklyMeetingTemplateId: updated.weeklyMeetingTemplateId ?? template.id,
    sectionPptxOverrides: updated.sectionPptxOverrides ?? overrides,
  };
}

/** 修改当前自定义模版：替换 blob，并更新列表与覆盖 */
export async function replaceSelectedWeeklyMeetingTemplate(
  draft: WeeklyBulletin,
  file: File,
): Promise<WeeklyBulletin> {
  const templateId = draft.weeklyMeetingTemplateId?.trim();
  if (!templateId) {
    throw new Error('invalid_meeting_template');
  }
  if (!isPptxFileName(file.name)) {
    throw new Error('invalid_pptx');
  }
  if (!(await pptxSlidesAreWellFormed(file))) {
    throw new Error('invalid_pptx');
  }

  const templates = [...(draft.weeklyMeetingTemplates ?? [])];
  const idx = templates.findIndex((t) => t.id === templateId);
  if (idx < 0) throw new Error('invalid_meeting_template');
  const prev = templates[idx]!;

  const downloadName = `周报-${draft.serviceDate}-本週聚会-${prev.label}.pptx`;
  const named = new File([file], downloadName, { type: PPTX_MIME });
  const uploaded = await uploadFile(named, {
    title: `周报本週聚会 ${prev.label} ${draft.serviceDate}`,
    notes: `bulletin weekly meeting template ${draft.id} ${templateId}`,
  });

  templates[idx] = { ...prev, blobId: uploaded.blobId };
  const overrides = withWeeklyMeetingsOverride(draft.sectionPptxOverrides, uploaded.blobId);

  const updated = await updateBulletin(draft.id, {
    weeklyMeetingTemplates: templates,
    weeklyMeetingTemplateId: templateId,
    sectionPptxOverrides: overrides,
  });
  return {
    ...updated,
    weeklyMeetingTemplates: updated.weeklyMeetingTemplates ?? templates,
    weeklyMeetingTemplateId: updated.weeklyMeetingTemplateId ?? templateId,
    sectionPptxOverrides: updated.sectionPptxOverrides ?? overrides,
  };
}

export async function downloadWeeklyMeetingTemplateBlob(
  draft: WeeklyBulletin,
  templateId: string,
): Promise<Blob | null> {
  const hit = (draft.weeklyMeetingTemplates ?? []).find((t) => t.id === templateId);
  if (!hit) return null;
  return fetchBlobContent(hit.blobId);
}

export function weeklyMeetingSelectValue(input: {
  weeklyMeetingVariant?: number | null;
  weeklyMeetingTemplateId?: string | null;
}): string {
  const customId = input.weeklyMeetingTemplateId?.trim();
  if (customId) return `t:${customId}`;
  const v = input.weeklyMeetingVariant;
  if (v === 28 || v === 29 || v === 30) return String(v);
  return '28';
}

export function parseWeeklyMeetingSelectValue(value: string):
  | { kind: 'builtin'; variant: 28 | 29 | 30 }
  | { kind: 'custom'; templateId: string } {
  if (value.startsWith('t:')) {
    const templateId = value.slice(2).trim();
    if (templateId) return { kind: 'custom', templateId };
  }
  const n = Number(value);
  if (n === 29 || n === 30) return { kind: 'builtin', variant: n };
  return { kind: 'builtin', variant: 28 };
}
