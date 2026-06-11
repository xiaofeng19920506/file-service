import { canonicalSongTitle } from '@file-service/shared';
const METADATA_FIELDS = [
    'titleEn',
    'titleZhCn',
    'titleZhTw',
    'composer',
    'author',
    'notes',
];
function norm(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed || null;
}
export function normalizeMetadataInput(input) {
    const legacyTitle = norm(input.title);
    return {
        titleEn: norm(input.titleEn),
        titleZhCn: norm(input.titleZhCn) ?? legacyTitle,
        titleZhTw: norm(input.titleZhTw),
        composer: norm(input.composer),
        author: norm(input.author),
        notes: norm(input.notes),
    };
}
export function pickMetadataSnapshot(row) {
    return normalizeMetadataInput(row);
}
export function metadataToDbRow(snapshot) {
    return {
        ...snapshot,
        title: canonicalSongTitle(snapshot),
    };
}
export function findMetadataConflicts(existing, incoming) {
    const next = normalizeMetadataInput(incoming);
    const conflicts = [];
    for (const field of METADATA_FIELDS) {
        const prev = existing[field];
        const value = next[field];
        if (prev && value && prev !== value) {
            conflicts.push({ field, existing: prev, incoming: value });
        }
    }
    return conflicts;
}
export function mergeMetadataFillEmpty(existing, incoming) {
    const next = normalizeMetadataInput(incoming);
    const patch = {};
    const filled = [];
    for (const field of METADATA_FIELDS) {
        const value = next[field];
        if (!existing[field] && value) {
            patch[field] = value;
            filled.push(field);
        }
    }
    return { patch, filled };
}
export function mergeMetadataOverwrite(incoming) {
    const next = normalizeMetadataInput(incoming);
    const patch = {};
    for (const field of METADATA_FIELDS) {
        const value = next[field];
        if (value !== null) {
            patch[field] = value;
        }
    }
    return patch;
}
//# sourceMappingURL=blob-metadata.js.map