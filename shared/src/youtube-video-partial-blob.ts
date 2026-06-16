import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from './db/index.js';
import { blobs, youtubeVideoCache } from './db/schema.js';
import {
  partialVideoContentSha256,
  youtubeVideoPartialStorageKey,
} from './youtube-video-storage.js';

export async function ensurePartialVideoBlob(
  db: Db,
  videoId: string,
  title?: string | null,
): Promise<string> {
  const storageKey = youtubeVideoPartialStorageKey(videoId);
  const shaHex = createHash('sha256').update(partialVideoContentSha256(videoId)).digest('hex');

  const inserted = await db
    .insert(blobs)
    .values({
      contentSha256: shaHex,
      storageKey,
      sizeBytes: 0,
      mimeType: 'video/mp4',
      originalFilename: `${videoId}.mp4`,
      originalExt: 'mp4',
      title: title ?? null,
      uploadedBy: 'youtube-video',
    })
    .onConflictDoUpdate({
      target: blobs.contentSha256,
      set: {
        storageKey,
        sizeBytes: 0,
        mimeType: 'video/mp4',
        originalFilename: `${videoId}.mp4`,
        title: title ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (inserted[0]) return inserted[0].id;

  const [existing] = await db.select().from(blobs).where(eq(blobs.contentSha256, shaHex));
  if (!existing) throw new Error('partial_blob_insert_failed');
  return existing.id;
}

export async function updatePartialVideoCachedBytes(
  db: Db,
  blobId: string,
  bytes: number,
): Promise<void> {
  await db
    .update(blobs)
    .set({ sizeBytes: bytes, updatedAt: new Date() })
    .where(eq(blobs.id, blobId));
}

export async function markPartialVideoReady(
  db: Db,
  videoId: string,
  blobId: string,
  finalBytes: number,
  title?: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .update(blobs)
    .set({ sizeBytes: finalBytes, updatedAt: now })
    .where(eq(blobs.id, blobId));
  await db
    .update(youtubeVideoCache)
    .set({
      status: 'ready',
      blobId,
      title: title ?? null,
      completedAt: now,
      updatedAt: now,
      errorCode: null,
      errorDetail: null,
    })
    .where(eq(youtubeVideoCache.youtubeVideoId, videoId));
}
