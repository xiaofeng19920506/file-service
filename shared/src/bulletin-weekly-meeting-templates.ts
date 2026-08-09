/** 本週聚会自定义模版（周报内；内置 A/B/C = P28/29/30 不在此列） */
export type WeeklyMeetingTemplate = {
  id: string;
  label: string;
  blobId: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeWeeklyMeetingTemplates(raw: unknown): WeeklyMeetingTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: WeeklyMeetingTemplate[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const blobId = typeof row.blobId === 'string' ? row.blobId.trim() : '';
    if (!id || seen.has(id)) continue;
    if (!blobId || !UUID_RE.test(blobId)) continue;
    seen.add(id);
    out.push({
      id,
      label: label || '自定义模版',
      blobId,
    });
  }
  return out;
}

export function normalizeWeeklyMeetingTemplateId(
  raw: unknown,
  templates: readonly WeeklyMeetingTemplate[],
): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id) return null;
  return templates.some((t) => t.id === id) ? id : null;
}

/** 下拉 value：内置 28/29/30，自定义 `t:<id>` */
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
