import { type Db } from '@file-service/shared';
import type { ObjectStorage } from '@file-service/shared';
import { type BlobMetadataInput, type MetadataConflict, type MetadataField, type MetadataSnapshot } from './blob-metadata.js';
export declare class ContentAlreadyExistsError extends Error {
    constructor();
}
export type PersistBlobResult = {
    blobId: string;
    sha256: string;
    deduplicated: boolean;
    metadataUpdated: boolean;
    metadataFilled: MetadataField[];
    metadataConflicts: MetadataConflict[];
    existingMetadata: MetadataSnapshot | null;
};
export declare function persistBlobFromBuffer(opts: {
    db: Db;
    storage: ObjectStorage;
    buf: Buffer;
    mimeType?: string | null;
    filename: string;
    ext: string;
    title?: string | null;
    titleEn?: string | null;
    titleZhCn?: string | null;
    titleZhTw?: string | null;
    composer?: string | null;
    author?: string | null;
    notes?: string | null;
    uploadedBy?: string;
}): Promise<PersistBlobResult>;
export declare function updateBlobMetadata(opts: {
    db: Db;
    blobId: string;
    metadata: BlobMetadataInput;
    overwrite: boolean;
    updatedBy?: string;
}): Promise<{
    blobId: string;
    metadata: MetadataSnapshot;
    updatedAt: Date | null;
    updatedBy: string | null;
} | null>;
export declare function deleteBlob(opts: {
    db: Db;
    storage: ObjectStorage;
    blobId: string;
}): Promise<boolean>;
//# sourceMappingURL=blob-store.d.ts.map