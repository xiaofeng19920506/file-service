import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { Db } from '@file-service/shared';
import {
  createObjectStorage,
  mergeJobs,
  loadWorkerEnv,
} from '@file-service/shared';

export async function sweepExpiredExports(db: Db): Promise<number> {
  const env = loadWorkerEnv();
  const storage = createObjectStorage(env);

  const now = new Date();
  const expired = await db
    .select()
    .from(mergeJobs)
    .where(
      and(
        eq(mergeJobs.status, 'succeeded'),
        isNotNull(mergeJobs.outputKey),
        isNotNull(mergeJobs.expiresAt),
        lt(mergeJobs.expiresAt, now),
      ),
    );

  for (const job of expired) {
    if (!job.outputKey) continue;
    try {
      await storage.deleteObject(job.outputKey);
    } catch {
      // file may already be gone; still mark row expired
    }
    await db
      .update(mergeJobs)
      .set({
        status: 'expired',
        outputKey: null,
      })
      .where(eq(mergeJobs.id, job.id));
  }

  return expired.length;
}
