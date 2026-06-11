import { eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { blobStorageKey, blobs, canonicalSongTitle, mergeJobInputs, } from '@file-service/shared';
import { mergeMetadataFillEmpty, mergeMetadataOverwrite, metadataToDbRow, normalizeMetadataInput, pickMetadataSnapshot, } from './blob-metadata.js';
export class ContentAlreadyExistsError extends Error {
    constructor() {
        super('content_already_exists');
        this.name = 'ContentAlreadyExistsError';
    }
}
export async function persistBlobFromBuffer(opts) {
    const { db, storage, buf, mimeType, filename, ext, composer, author, notes } = opts;
    const incoming = {
        title: opts.title,
        titleEn: opts.titleEn,
        titleZhCn: opts.titleZhCn,
        titleZhTw: opts.titleZhTw,
        composer,
        author,
        notes,
    };
    const snapshot = normalizeMetadataInput(incoming);
    const dbMeta = metadataToDbRow(snapshot);
    const shaHex = createHash('sha256').update(buf).digest('hex');
    const key = blobStorageKey(shaHex);
    const alreadyInStorage = await storage.exists(key);
    if (!alreadyInStorage) {
        await storage.putObject(key, buf, mimeType ?? undefined);
    }
    const inserted = await db
        .insert(blobs)
        .values({
        contentSha256: shaHex,
        storageKey: key,
        sizeBytes: buf.length,
        mimeType: mimeType ?? null,
        originalFilename: filename,
        originalExt: ext,
        title: dbMeta.title,
        titleEn: dbMeta.titleEn,
        titleZhCn: dbMeta.titleZhCn,
        titleZhTw: dbMeta.titleZhTw,
        composer: dbMeta.composer,
        author: dbMeta.author,
        notes: dbMeta.notes,
        uploadedBy: opts.uploadedBy ?? null,
    })
        .onConflictDoNothing({ target: blobs.contentSha256 })
        .returning();
    if (inserted.length > 0) {
        return {
            blobId: inserted[0].id,
            sha256: shaHex,
            deduplicated: alreadyInStorage,
            metadataUpdated: false,
            metadataFilled: [],
            metadataConflicts: [],
            existingMetadata: null,
        };
    }
    const [existing] = await db
        .select()
        .from(blobs)
        .where(eq(blobs.contentSha256, shaHex));
    if (!existing) {
        throw new Error('blob_insert_race');
    }
    throw new ContentAlreadyExistsError();
}
export async function updateBlobMetadata(opts) {
    const [existing] = await opts.db.select().from(blobs).where(eq(blobs.id, opts.blobId));
    if (!existing)
        return null;
    const existingSnapshot = pickMetadataSnapshot(existing);
    const patch = opts.overwrite
        ? mergeMetadataOverwrite(opts.metadata)
        : mergeMetadataFillEmpty(existingSnapshot, opts.metadata).patch;
    if (Object.keys(patch).length > 0) {
        const merged = { ...existingSnapshot, ...patch };
        await opts.db
            .update(blobs)
            .set({
            ...patch,
            title: canonicalSongTitle(merged),
            updatedAt: sql `now()`,
            updatedBy: opts.updatedBy ?? null,
        })
            .where(eq(blobs.id, existing.id));
    }
    const [updated] = await opts.db.select().from(blobs).where(eq(blobs.id, opts.blobId));
    return {
        blobId: opts.blobId,
        metadata: pickMetadataSnapshot(updated),
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
    };
}
export async function deleteBlob(opts) {
    const [blob] = await opts.db.select().from(blobs).where(eq(blobs.id, opts.blobId));
    if (!blob)
        return false;
    const storageKey = blob.storageKey;
    await opts.db.delete(mergeJobInputs).where(eq(mergeJobInputs.blobId, opts.blobId));
    await opts.db.delete(blobs).where(eq(blobs.id, opts.blobId));
    const [otherBlob] = await opts.db
        .select({ id: blobs.id })
        .from(blobs)
        .where(eq(blobs.storageKey, storageKey))
        .limit(1);
    if (!otherBlob && (await opts.storage.exists(storageKey))) {
        await opts.storage.deleteObject(storageKey);
    }
    return true;
}
//# sourceMappingURL=blob-store.js.map