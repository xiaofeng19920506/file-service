/** Primary label for lists: 简体 → 繁体 → 英文 → legacy title */
export function primarySongTitle(fields) {
    return (fields.titleZhCn?.trim() ||
        fields.titleZhTw?.trim() ||
        fields.titleEn?.trim() ||
        fields.title?.trim() ||
        null);
}
/** Canonical `title` column value kept for backward-compatible search/display. */
export function canonicalSongTitle(fields) {
    return primarySongTitle(fields);
}
export function formatSongTitleDisplay(fields) {
    const parts = [
        fields.titleZhCn?.trim(),
        fields.titleZhTw?.trim(),
        fields.titleEn?.trim(),
    ].filter(Boolean);
    if (parts.length)
        return parts.join(' · ');
    return fields.title?.trim() ?? '';
}
//# sourceMappingURL=song-title.js.map