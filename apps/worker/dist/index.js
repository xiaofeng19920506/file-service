import { loadEnvFile } from '@file-service/shared';
loadEnvFile();
import { Worker } from 'bullmq';
import { copyFile, mkdir, readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, asc } from 'drizzle-orm';
import { createDb, loadWorkerEnv, createObjectStorage, exportStorageKey, MERGE_QUEUE_NAME, mergeJobs, mergeJobInputs, blobs, bullmqConnection, } from '@file-service/shared';
import { mergePresentations } from './merge.js';
import { convertToPptx, needsLibreofficeConversion } from '@file-service/shared';
import { sweepExpiredExports } from './cleanup.js';
import { notifyJobWebhook } from './notify-webhook.js';
async function main() {
    const env = loadWorkerEnv();
    const db = createDb(env.DATABASE_URL);
    const storage = createObjectStorage(env);
    await storage.ensureReady();
    const worker = new Worker(MERGE_QUEUE_NAME, async (job) => {
        const { mergeJobId } = job.data;
        const report = async (progress) => {
            await db
                .update(mergeJobs)
                .set({ progress: Math.min(100, Math.max(0, Math.round(progress))) })
                .where(eq(mergeJobs.id, mergeJobId));
        };
        await db
            .update(mergeJobs)
            .set({ status: 'running', progress: 5 })
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
        const total = rows.length;
        const workRoot = await mkdtemp(join(tmpdir(), 'fs-merge-'));
        try {
            const pptxPaths = [];
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
                }
                else {
                    const pptxPath = join(workRoot, `norm-${i}.pptx`);
                    await copyFile(rawPath, pptxPath);
                    pptxPaths.push(pptxPath);
                }
                await report(10 + ((i + 1) / total) * 50);
            }
            await report(70);
            const outPath = join(workRoot, 'merged.pptx');
            await mergePresentations(pptxPaths, outPath);
            await report(85);
            const body = await readFile(outPath);
            const outKey = exportStorageKey(mergeJobId);
            await storage.putObject(outKey, body, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            await report(95);
            const expiresAt = new Date(Date.now() + env.EXPORT_RETENTION_DAYS * 86_400_000);
            await db
                .update(mergeJobs)
                .set({
                status: 'succeeded',
                progress: 100,
                outputKey: outKey,
                expiresAt,
                completedAt: new Date(),
                errorCode: null,
                errorDetail: null,
            })
                .where(eq(mergeJobs.id, mergeJobId));
            await notifyJobWebhook(db, mergeJobId, 'job.succeeded', env.WEBHOOK_SECRET).catch((err) => console.error('webhook notify failed', mergeJobId, err));
        }
        catch (e) {
            await db
                .update(mergeJobs)
                .set({
                status: 'failed',
                errorCode: 'merge_failed',
                errorDetail: e instanceof Error ? e.message : String(e),
            })
                .where(eq(mergeJobs.id, mergeJobId));
            await notifyJobWebhook(db, mergeJobId, 'job.failed', env.WEBHOOK_SECRET).catch((err) => console.error('webhook notify failed', mergeJobId, err));
            throw e;
        }
        finally {
            await rm(workRoot, { recursive: true, force: true });
        }
    }, { connection: bullmqConnection(env.REDIS_URL), concurrency: env.WORKER_CONCURRENCY });
    worker.on('failed', (j, err) => {
        console.error('merge job failed', j?.id, err);
    });
    setInterval(() => {
        sweepExpiredExports(db).catch((err) => console.error('cleanup sweep failed', err));
    }, 60 * 60 * 1000);
    setTimeout(() => {
        sweepExpiredExports(db).catch((err) => console.error('cleanup sweep failed', err));
    }, 30_000);
    console.log('worker listening', MERGE_QUEUE_NAME, 'concurrency=', env.WORKER_CONCURRENCY);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map