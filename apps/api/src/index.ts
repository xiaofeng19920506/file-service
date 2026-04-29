import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { eq, asc, inArray } from 'drizzle-orm';
import {
  createDb,
  loadApiEnv,
  createObjectStorage,
  blobStorageKey,
  MERGE_QUEUE_NAME,
  signDownloadToken,
  verifyDownloadToken,
  blobs,
  mergeJobs,
  mergeJobInputs,
} from '@file-service/shared';

async function main() {
  const env = loadApiEnv();
  const db = createDb(env.DATABASE_URL);
  const storage = createObjectStorage(env);
  await storage.ensureReady();

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const mergeQueue = new Queue(MERGE_QUEUE_NAME, { connection: redis });

  const app = Fastify({ logger: true });
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    },
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/v1/uploads', async (request, reply) => {
    const mp = await request.file();
    if (!mp) {
      return reply.code(400).send({ error: 'missing_file' });
    }
    const ext =
      mp.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ??
      'bin';
    const tmpPath = join(tmpdir(), `upload-${randomUUID()}`);
    const hash = createHash('sha256');
    const ws = createWriteStream(tmpPath);
    try {
      for await (const chunk of mp.file) {
        hash.update(chunk);
        if (!ws.write(chunk)) {
          await new Promise<void>((res) => ws.once('drain', res));
        }
      }
      ws.end();
      await finished(ws);
    } catch {
      ws.destroy();
      await unlink(tmpPath).catch(() => {});
      return reply.code(400).send({ error: 'upload_failed' });
    }

    const shaHex = hash.digest('hex');
    const key = blobStorageKey(shaHex);
    const buf = await readFile(tmpPath);
    await unlink(tmpPath).catch(() => {});

    const alreadyInStorage = await storage.exists(key);
    if (!alreadyInStorage) {
      await storage.putObject(key, buf, mp.mimetype);
    }

    const inserted = await db
      .insert(blobs)
      .values({
        contentSha256: shaHex,
        storageKey: key,
        sizeBytes: buf.length,
        mimeType: mp.mimetype,
        originalFilename: mp.filename,
        originalExt: ext,
      })
      .onConflictDoNothing({ target: blobs.contentSha256 })
      .returning();

    if (inserted.length > 0) {
      return {
        blobId: inserted[0].id,
        sha256: shaHex,
        deduplicated: alreadyInStorage,
      };
    }

    const [existing] = await db
      .select()
      .from(blobs)
      .where(eq(blobs.contentSha256, shaHex));
    return {
      blobId: existing!.id,
      sha256: shaHex,
      deduplicated: true,
    };
  });

  type CreateJobBody = { inputs: { blobId: string; order?: number }[] };

  app.post<{ Body: CreateJobBody }>('/v1/jobs', async (request, reply) => {
    const body = request.body;
    if (!body?.inputs?.length) {
      return reply.code(400).send({ error: 'inputs_required' });
    }
    const withOrder = body.inputs.map((input, i) => ({
      blobId: input.blobId,
      order: input.order ?? i,
    }));
    const sorted = [...withOrder].sort((a, b) => a.order - b.order);
    const blobIds = sorted.map((i) => i.blobId);
    const found = await db.select().from(blobs).where(inArray(blobs.id, blobIds));
    if (found.length !== blobIds.length) {
      return reply.code(400).send({ error: 'unknown_blob_id' });
    }

    const [job] = await db
      .insert(mergeJobs)
      .values({ status: 'queued' })
      .returning();

    await db.insert(mergeJobInputs).values(
      sorted.map((input, idx) => ({
        jobId: job.id,
        blobId: input.blobId,
        sortOrder: idx,
      })),
    );

    await mergeQueue.add(
      'merge',
      { mergeJobId: job.id },
      { removeOnComplete: true, removeOnFail: false },
    );

    return { jobId: job.id, status: job.status };
  });

  app.get<{ Params: { id: string } }>('/v1/jobs/:id', async (request, reply) => {
    const id = request.params.id;
    const [job] = await db.select().from(mergeJobs).where(eq(mergeJobs.id, id));
    if (!job) return reply.code(404).send({ error: 'not_found' });
    const inputs = await db
      .select({
        blobId: mergeJobInputs.blobId,
        sortOrder: mergeJobInputs.sortOrder,
      })
      .from(mergeJobInputs)
      .where(eq(mergeJobInputs.jobId, id))
      .orderBy(asc(mergeJobInputs.sortOrder));
    return {
      jobId: job.id,
      status: job.status,
      errorCode: job.errorCode,
      errorDetail: job.errorDetail,
      expiresAt: job.expiresAt,
      outputKey: job.outputKey,
      inputs,
    };
  });

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/v1/jobs/:id/download',
    async (request, reply) => {
      const id = request.params.id;
      const token = request.query.token;
      if (!token) {
        return reply.code(401).send({ error: 'token_required' });
      }
      const v = verifyDownloadToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        token,
      });
      if (!v || v.jobId !== id) {
        return reply.code(401).send({ error: 'invalid_token' });
      }
      const [job] = await db.select().from(mergeJobs).where(eq(mergeJobs.id, id));
      if (!job || job.status !== 'succeeded' || !job.outputKey) {
        return reply.code(404).send({ error: 'not_ready' });
      }
      const outputKey = job.outputKey;
      if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
        return reply.code(410).send({ error: 'expired' });
      }

      const ttl = Math.min(3600, env.DOWNLOAD_URL_TTL_SECONDS);
      const presign = storage.presignedGetUrl;
      if (presign) {
        const url = await presign.call(storage, outputKey, ttl);
        return reply.redirect(url);
      }

      const stream = await storage.createReadStream(outputKey);
      return reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        )
        .header(
          'Content-Disposition',
          'attachment; filename="merged.pptx"',
        )
        .send(stream);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/jobs/:id/download-url',
    async (request, reply) => {
      const id = request.params.id;
      const [job] = await db.select().from(mergeJobs).where(eq(mergeJobs.id, id));
      if (!job?.outputKey || job.status !== 'succeeded') {
        return reply.code(404).send({ error: 'not_ready' });
      }
      if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
        return reply.code(410).send({ error: 'expired' });
      }
      const exp = Math.floor(job.expiresAt!.getTime() / 1000);
      const token = signDownloadToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        jobId: id,
        expiresAtUnix: exp,
      });
      const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
      const path = `/v1/jobs/${id}/download?token=${encodeURIComponent(token)}`;
      const url = publicBase ? `${publicBase}${path}` : path;
      return {
        url,
        expiresAt: job.expiresAt,
      };
    },
  );

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
