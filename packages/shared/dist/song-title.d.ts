export type SongTitleFields = {
    title?: string | null;
    titleEn?: string | null;
    titleZhCn?: string | null;
    titleZhTw?: string | null;
};
/** Primary label for lists: 简体 → 繁体 → 英文 → legacy title */
export declare function primarySongTitle(fields: SongTitleFields): string | null;
/** Canonical `title` column value kept for backward-compatible search/display. */
export declare function canonicalSongTitle(fields: SongTitleFields): string | null;
export declare function formatSongTitleDisplay(fields: SongTitleFields): string;
//# sourceMappingURL=song-title.d.ts.map