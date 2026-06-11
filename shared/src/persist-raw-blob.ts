import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from './db/index.js';
import { blobs } from './db/schema.js';
import { blobStorageKey } from './storage/keys.js';
import type { ObjectStorage } from './storage/types.js';

export async function persistRawBlob(opts: {
  db: Db;
  storage: ObjectStorage;
  buf: Buffer;
  mimeType: string;
  filename: string;
  ext: string;
  title?: string | null;
  uploadedBy?: string;
}): Promise<{ blobId: string; sha256: string; deduplicated: boolean }> {
  const shaHex = createHash('sha256').update(opts.buf).digest('hex');
  const key = blobStorageKey(shaHex);
  const alreadyInStorage = await opts.storage.exists(key);
  if (!alreadyInStorage) {
    await opts.storage.putObject(key, opts.buf, opts.mimeType);
  }

  const inserted = await opts.db
    .insert(blobs)
    .values({
      contentSha256: shaHex,
      storageKey: key,
      sizeBytes: opts.buf.length,
      mimeType: opts.mimeType,
      originalFilename: opts.filename,
      originalExt: opts.ext,
      title: opts.title ?? null,
      uploadedBy: opts.uploadedBy ?? 'youtube-audio',
    })
    .onConflictDoNothing({ target: blobs.contentSha256 })
    .returning();

  if (inserted.length > 0) {
    return { blobId: inserted[0]!.id, sha256: shaHex, deduplicated: alreadyInStorage };
  }

  const [existing] = await opts.db
    .select()
    .from(blobs)
    .where(eq(blobs.contentSha256, shaHex));
  if (!existing) throw new Error('blob_insert_race');
  return { blobId: existing.id, sha256: shaHex, deduplicated: true };
}
