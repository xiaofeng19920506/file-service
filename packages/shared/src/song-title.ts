export type SongTitleFields = {
  title?: string | null;
  titleEn?: string | null;
  titleZhCn?: string | null;
  titleZhTw?: string | null;
};

/** Primary label for lists: 简体 → 繁体 → 英文 → legacy title */
export function primarySongTitle(fields: SongTitleFields): string | null {
  return (
    fields.titleZhCn?.trim() ||
    fields.titleZhTw?.trim() ||
    fields.titleEn?.trim() ||
    fields.title?.trim() ||
    null
  );
}

/** Canonical `title` column value kept for backward-compatible search/display. */
export function canonicalSongTitle(fields: SongTitleFields): string | null {
  return primarySongTitle(fields);
}

export function formatSongTitleDisplay(fields: SongTitleFields): string {
  const parts = [
    fields.titleZhCn?.trim(),
    fields.titleZhTw?.trim(),
    fields.titleEn?.trim(),
  ].filter(Boolean) as string[];
  if (parts.length) return parts.join(' · ');
  return fields.title?.trim() ?? '';
}
