export type SongTitleFields = {
  title?: string | null;
  titleEn?: string | null;
  titleZhCn?: string | null;
  titleZhTw?: string | null;
};

export type SongTitleInput = {
  titleEn: string;
  titleZhCn: string;
  titleZhTw: string;
};

export const EMPTY_SONG_TITLE: SongTitleInput = {
  titleEn: '',
  titleZhCn: '',
  titleZhTw: '',
};

export function primarySongTitle(fields: SongTitleFields): string | null {
  return (
    fields.titleZhCn?.trim() ||
    fields.titleZhTw?.trim() ||
    fields.titleEn?.trim() ||
    fields.title?.trim() ||
    null
  );
}

export function hasAnySongTitle(input: SongTitleInput): boolean {
  return Object.values(input).some((v) => v.trim().length > 0);
}

export function songTitleSummary(input: SongTitleInput): string {
  return primarySongTitle(input) ?? '';
}

export function songTitleFromBlob(blob: SongTitleFields): SongTitleInput {
  return {
    titleEn: blob.titleEn ?? '',
    titleZhCn: blob.titleZhCn ?? blob.title ?? '',
    titleZhTw: blob.titleZhTw ?? '',
  };
}

export type SongTitleLocale = 'zh-CN' | 'en';

/** Single title for list display: match UI locale, default fallback prefers English. */
export function localizedSongTitle(
  fields: SongTitleFields,
  locale: SongTitleLocale,
  fallback?: string | null,
): string {
  const en = fields.titleEn?.trim();
  const zhCn = fields.titleZhCn?.trim() || fields.title?.trim();
  const zhTw = fields.titleZhTw?.trim();

  if (locale === 'zh-CN') {
    return zhCn || zhTw || en || fallback?.trim() || '';
  }
  return en || zhCn || zhTw || fallback?.trim() || '';
}
