import { type SongTitleFields } from '@file-service/shared';
export type MetadataField = 'titleEn' | 'titleZhCn' | 'titleZhTw' | 'composer' | 'author' | 'notes';
export type BlobMetadataInput = {
    /** @deprecated legacy single title — mapped to titleZhCn when empty */
    title?: string | null;
    titleEn?: string | null;
    titleZhCn?: string | null;
    titleZhTw?: string | null;
    composer?: string | null;
    author?: string | null;
    notes?: string | null;
};
export type MetadataConflict = {
    field: MetadataField;
    existing: string;
    incoming: string;
};
export type MetadataSnapshot = {
    titleEn: string | null;
    titleZhCn: string | null;
    titleZhTw: string | null;
    composer: string | null;
    author: string | null;
    notes: string | null;
};
export declare function normalizeMetadataInput(input: BlobMetadataInput): MetadataSnapshot;
export declare function pickMetadataSnapshot(row: BlobMetadataInput): MetadataSnapshot;
export declare function metadataToDbRow(snapshot: MetadataSnapshot): SongTitleFields & MetadataSnapshot & {
    title: string | null;
};
export declare function findMetadataConflicts(existing: MetadataSnapshot, incoming: BlobMetadataInput): MetadataConflict[];
export declare function mergeMetadataFillEmpty(existing: MetadataSnapshot, incoming: BlobMetadataInput): {
    patch: Partial<MetadataSnapshot>;
    filled: MetadataField[];
};
export declare function mergeMetadataOverwrite(incoming: BlobMetadataInput): Partial<MetadataSnapshot>;
//# sourceMappingURL=blob-metadata.d.ts.map