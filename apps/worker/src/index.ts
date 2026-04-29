import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { copyFile, mkdir, readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, asc } from 'drizzle-orm';
import {
  createDb,
  loadWorkerEnv,
  createObjectStorage,
  exportStorageKey,
  MERGE_QUEUE_NAME,
  mergeJobs,
  mergeJobInputs,
  blobs,
} from '@file-service/shared';
import { mergePresentations } from './merge.js';
import { convertToPptx, needsLibreofficeConversion } from './libreoffice.js';
import { sweepExpiredExports } from './cleanup.js';

async function main() {
  const env = loadWorkerEnv();
  const db = createDb(env.DATABASE_URL);
  const storage = createObjectStorage(env);
  await storage.ensureReady();
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker(
    MERGE_QUEUE_NAME,
    async (job) => {
      const { mergeJobId } = job.data as { mergeJobId: string };
      await db
        .update(mergeJobs)
        .set({ status: 'running' })
        .where(eq(mergeJobs.id, mergeJobId));

      const rows = await db
        .select({
          sortOrder: mergeJobInputs.sortOrder,
          blob: blobs,
        })
        .from(mergeJobInputs)
        .innerJoin(blobs, eq(mergeJobInputs.blobId, blobs.id))
        .where(eq(mergeJobInputs.jobId, mergeJobId))
        .orderBy(asc(mergeJobInputs.sortOrder));

      const workRoot = await mkdtemp(join(tmpdir(), 'fs-merge-'));
      try {
        const pptxPaths: string[] = [];
        for (let i = 0; i < rows.length; i++) {
          const { blob } = rows[i];
          const ext = blob.originalExt ?? 'pptx';
          const rawPath = join(workRoot, `raw-${i}.${ext}`);
          await storage.copyToFile(blob.storageKey, rawPath);
          if (needsLibreofficeConversion(ext)) {
            const convDir = join(workRoot, `conv-${i}`);
            await mkdir(convDir, { recursive: true });
            const pptx = await convertToPptx({
              sofficePath: env.SOFFICE_PATH,
              inputPath: rawPath,
              outDir: convDir,
            });
            pptxPaths.push(pptx);
          } else {
            const pptxPath = join(workRoot, `norm-${i}.pptx`);
            await copyFile(rawPath, pptxPath);
            pptxPaths.push(pptxPath);
          }
        }

        const outPath = join(workRoot, 'merged.pptx');
        await mergePresentations(pptxPaths, outPath);
        const body = await readFile(outPath);
        const outKey = exportStorageKey(mergeJobId);
        await storage.putObject(
          outKey,
          body,
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        );

        const expiresAt = new Date(
          Date.now() + env.EXPORT_RETENTION_DAYS * 86_400_000,
        );
        await db
          .update(mergeJobs)
          .set({
            status: 'succeeded',
            outputKey: outKey,
            expiresAt,
            completedAt: new Date(),
            errorCode: null,
            errorDetail: null,
          })
          .where(eq(mergeJobs.id, mergeJobId));
      } catch (e) {
        await db
          .update(mergeJobs)
          .set({
            status: 'failed',
            errorCode: 'merge_failed',
            errorDetail: e instanceof Error ? e.message : String(e),
          })
          .where(eq(mergeJobs.id, mergeJobId));
        throw e;
      } finally {
        await rm(workRoot, { recursive: true, force: true });
      }
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on('failed', (j, err) => {
    console.error('merge job failed', j?.id, err);
  });

  setInterval(() => {
    sweepExpiredExports(db).catch((err) =>
      console.error('cleanup sweep failed', err),
    );
  }, 60 * 60 * 1000);

  setTimeout(() => {
    sweepExpiredExports(db).catch((err) =>
      console.error('cleanup sweep failed', err),
    );
  }, 30_000);

  console.log('worker listening', MERGE_QUEUE_NAME);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
