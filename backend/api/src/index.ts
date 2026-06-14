import { loadEnvFile } from '@file-service/shared';
loadEnvFile();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, asc, inArray, and, or, desc, sql } from 'drizzle-orm';
import { expandSearchQuery } from './chinese-search.js';
import {
  createDb,
  loadApiEnv,
  runMigrations,
  createObjectStorage,
  MERGE_QUEUE_NAME,
  YOUTUBE_AUDIO_QUEUE_NAME,
  signDownloadToken,
  verifyDownloadToken,
  bullmqConnection,
  convertToPptx,
  needsLibreofficeConversion,
  loadApiKeyConfig,
  blobStorageKey,
  blobs,
  mergeJobs,
  mergeJobInputs,
} from '@file-service/shared';
import {
  ContentAlreadyExistsError,
  deleteBlob,
  persistBlobFromBuffer,
  updateBlobMetadata,
} from './blob-store.js';
import { readMultipartFileBuffer, readUploadMetadata } from './multipart-read.js';
import {
  registerChunkUploadRoutes,
  sweepExpiredUploadSessions,
} from './chunk-upload.js';
import { registerStaticAssets } from './static.js';
import { registerRateLimiting } from './rate-limit.js';
import { registerHealthRoutes } from './health.js';
import { registerOpenApi } from './openapi.js';
import { registerAuthRoutes } from './auth.js';
import { registerAdminUserRoutes } from './admin-users.js';
import { registerPlaylistRoutes } from './playlists.js';
import { registerYoutubeCaptionRoutes } from './youtube-captions.js';
import { registerYoutubeAudioRoutes } from './youtube-audio.js';
import { registerYoutubeOAuthRoutes } from './youtube-oauth.js';
import { registerYoutubeSearchRoutes } from './youtube-search.js';
import { registerYoutubeTrendingRoutes } from './youtube-trending.js';
import { resolveRequestActor } from './request-actor.js';

async function buildApp() {
  const env = loadApiEnv();

  if (process.env.RUN_MIGRATIONS !== '0') {
    await runMigrations(env.DATABASE_URL);
  }

  const db = createDb(env.DATABASE_URL);
  const storage = createObjectStorage(env);
  await storage.ensureReady();

  const mergeQueue = new Queue(MERGE_QUEUE_NAME, {
    connection: bullmqConnection(env.REDIS_URL),
  });
  const audioQueue = new Queue(YOUTUBE_AUDIO_QUEUE_NAME, {
    connection: bullmqConnection(env.REDIS_URL),
  });

  const app = Fastify({ logger: true });

  if (process.env.ENABLE_OPENAPI === '1' || process.env.NODE_ENV !== 'production') {
    await registerOpenApi(app);
  }

  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];
  await app.register(cors, {
    origin: corsOrigins,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Client'],
  });
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    },
    attachFieldsToBody: true,
  });

  await registerRateLimiting(app, env);

  const apiKeyConfig = loadApiKeyConfig(env.API_KEY);
  registerAuthRoutes(app, { db, env, apiKeyConfig });
  registerAdminUserRoutes(app, { db });
  registerPlaylistRoutes(app, { db, env, audioQueue });
  registerYoutubeCaptionRoutes(app);
  registerYoutubeAudioRoutes(app, { db, env, storage, audioQueue });
  registerYoutubeOAuthRoutes(app, { db, env });
  registerYoutubeSearchRoutes(app, { env });
  registerYoutubeTrendingRoutes(app, { db });

  const maxUploadBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  const getActor = (request: import('fastify').FastifyRequest) =>
    resolveRequestActor({
      request,
      apiKeyConfig,
      sessionSecret: env.DOWNLOAD_HMAC_SECRET,
    });
  registerChunkUploadRoutes(app, { db, storage, maxUploadBytes, getActor });

  setInterval(() => {
    sweepExpiredUploadSessions().catch((err) =>
      app.log.error(err, 'upload session sweep failed'),
    );
  }, 30 * 60 * 1000);

  registerHealthRoutes(app, { db, redisUrl: env.REDIS_URL });

  const PPTX_MIME =
    'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const previewPptxCache = new Map<string, Buffer>();

  app.get<{ Params: { id: string } }>(
    '/v1/blobs/:id/preview.pptx',
    async (request, reply) => {
      const id = request.params.id;
      const [blob] = await db.select().from(blobs).where(eq(blobs.id, id));
      if (!blob) return reply.code(404).send({ error: 'not_found' });

      const ext =
        blob.originalExt ??
        blob.originalFilename?.split('.').pop()?.toLowerCase() ??
        'pptx';
      const cacheKey = `${id}:${blob.contentSha256}`;
      const cached = previewPptxCache.get(cacheKey);
      if (cached) {
        return reply
          .header('Content-Type', PPTX_MIME)
          .header('X-Preview-Converted', 'true')
          .send(cached);
      }

      if (!needsLibreofficeConversion(ext)) {
        const stream = await storage.createReadStream(blob.storageKey);
        return reply
          .header('Content-Type', PPTX_MIME)
          .header('X-Preview-Converted', 'false')
          .send(stream);
      }

      const workRoot = await mkdtemp(join(tmpdir(), 'fs-preview-'));
      try {
        const rawPath = join(workRoot, `source.${ext}`);
        await storage.copyToFile(blob.storageKey, rawPath);
        const pptxPath = await convertToPptx({
          sofficePath: env.SOFFICE_PATH,
          inputPath: rawPath,
          outDir: workRoot,
        });
        const buf = await readFile(pptxPath);
        previewPptxCache.set(cacheKey, buf);
        if (previewPptxCache.size > 50) {
          const oldest = previewPptxCache.keys().next().value;
          if (oldest) previewPptxCache.delete(oldest);
        }
        return reply
          .header('Content-Type', PPTX_MIME)
          .header('X-Preview-Converted', 'true')
          .send(buf);
      } catch (e) {
        request.log.error(e);
        return reply.code(503).send({ error: 'preview_conversion_failed' });
      } finally {
        await rm(workRoot, { recursive: true, force: true });
      }
    },
  );

  app.get<{ Querystring: { q?: string; title?: string; composer?: string; author?: string; limit?: string } }>(
    '/v1/blobs',
    async (request) => {
      const query = request.query.q?.trim();
      const title = request.query.title?.trim();
      const composer = request.query.composer?.trim();
      const author = request.query.author?.trim();
      const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 200);

      const conditions = [];
      if (query) {
        const terms = expandSearchQuery(query);
        const termClauses = terms.map((term) => {
          const text = `%${term}%`;
          return sql`(
            lower(${blobs.titleEn}) LIKE ${text}
            OR lower(${blobs.titleZhCn}) LIKE ${text}
            OR lower(${blobs.titleZhTw}) LIKE ${text}
            OR lower(${blobs.title}) LIKE ${text}
            OR lower(${blobs.composer}) LIKE ${text}
            OR lower(${blobs.author}) LIKE ${text}
            OR lower(${blobs.originalFilename}) LIKE ${text}
          )`;
        });
        if (termClauses.length === 1) {
          conditions.push(termClauses[0]!);
        } else if (termClauses.length > 1) {
          conditions.push(or(...termClauses)!);
        }
      }
      if (title) {
        const terms = expandSearchQuery(title);
        const titleClauses = terms.map((term) => {
          const text = `%${term}%`;
          return sql`(
            lower(${blobs.titleEn}) LIKE ${text}
            OR lower(${blobs.titleZhCn}) LIKE ${text}
            OR lower(${blobs.titleZhTw}) LIKE ${text}
            OR lower(${blobs.title}) LIKE ${text}
          )`;
        });
        if (titleClauses.length === 1) {
          conditions.push(titleClauses[0]!);
        } else if (titleClauses.length > 1) {
          conditions.push(or(...titleClauses)!);
        }
      }
      if (composer) {
        conditions.push(sql`lower(${blobs.composer}) LIKE ${`%${composer.toLowerCase()}%`}`);
      }
      if (author) {
        conditions.push(sql`lower(${blobs.author}) LIKE ${`%${author.toLowerCase()}%`}`);
      }

      const queryBuilder = db
        .select({
          id: blobs.id,
          contentSha256: blobs.contentSha256,
          originalFilename: blobs.originalFilename,
          title: blobs.title,
          titleEn: blobs.titleEn,
          titleZhCn: blobs.titleZhCn,
          titleZhTw: blobs.titleZhTw,
          composer: blobs.composer,
          author: blobs.author,
          notes: blobs.notes,
          createdAt: blobs.createdAt,
          updatedAt: blobs.updatedAt,
          uploadedBy: blobs.uploadedBy,
          updatedBy: blobs.updatedBy,
          sizeBytes: blobs.sizeBytes,
          mimeType: blobs.mimeType,
        })
        .from(blobs)
        .orderBy(desc(blobs.createdAt))
        .limit(limit);

      const rows = conditions.length
        ? await queryBuilder.where(and(...conditions))
        : await queryBuilder;

      return rows;
    },
  );

  app.get<{ Querystring: { sha256?: string } }>(
    '/v1/blobs/exists',
    async (request, reply) => {
      const sha = request.query.sha256?.trim().toLowerCase() ?? '';
      if (!/^[a-f0-9]{64}$/.test(sha)) {
        return reply.code(400).send({ error: 'invalid_sha256' });
      }
      const [row] = await db
        .select({ id: blobs.id })
        .from(blobs)
        .where(eq(blobs.contentSha256, sha))
        .limit(1);
      return { exists: Boolean(row) };
    },
  );

  app.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      titleEn?: string;
      titleZhCn?: string;
      titleZhTw?: string;
      composer?: string;
      author?: string;
      notes?: string;
      overwrite?: boolean;
    };
  }>('/v1/blobs/:id/metadata', async (request, reply) => {
    const body = request.body ?? {};
    const result = await updateBlobMetadata({
      db,
      blobId: request.params.id,
      metadata: {
        title: body.title,
        titleEn: body.titleEn,
        titleZhCn: body.titleZhCn,
        titleZhTw: body.titleZhTw,
        composer: body.composer,
        author: body.author,
        notes: body.notes,
      },
      overwrite: body.overwrite === true,
      updatedBy: getActor(request),
    });
    if (!result) return reply.code(404).send({ error: 'not_found' });
    return result;
  });

  app.delete<{ Params: { id: string } }>('/v1/blobs/:id', async (request, reply) => {
    const id = request.params.id;
    const deleted = await deleteBlob({ db, storage, blobId: id });
    if (!deleted) return reply.code(404).send({ error: 'not_found' });
    for (const key of previewPptxCache.keys()) {
      if (key.startsWith(`${id}:`)) previewPptxCache.delete(key);
    }
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>(
    '/v1/blobs/:id/content',
    async (request, reply) => {
      const id = request.params.id;
      const [blob] = await db.select().from(blobs).where(eq(blobs.id, id));
      if (!blob) return reply.code(404).send({ error: 'not_found' });
      const stream = await storage.createReadStream(blob.storageKey);
      return reply
        .header(
          'Content-Type',
          blob.mimeType ??
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        )
        .header(
          'Content-Disposition',
          `inline; filename="${blob.originalFilename ?? 'file.pptx'}"`,
        )
        .send(stream);
    },
  );

  app.put<{ Params: { id: string } }>(
    '/v1/blobs/:id/content',
    async (request, reply) => {
      const id = request.params.id;
      const [blob] = await db.select().from(blobs).where(eq(blobs.id, id));
      if (!blob) return reply.code(404).send({ error: 'not_found' });

      const uploaded = await readMultipartFileBuffer(request, 'file');
      if (!uploaded) return reply.code(400).send({ error: 'missing_file' });

      const { buffer: buf, filename: uploadFilename, mimetype } = uploaded;
      const shaHex = createHash('sha256').update(buf).digest('hex');
      const key = blobStorageKey(shaHex);

      const [sameContent] = await db
        .select({ id: blobs.id })
        .from(blobs)
        .where(eq(blobs.contentSha256, shaHex));
      if (sameContent && sameContent.id !== id) {
        return reply.code(409).send({ error: 'content_already_exists' });
      }

      const alreadyInStorage = await storage.exists(key);
      if (!alreadyInStorage) {
        await storage.putObject(key, buf, mimetype);
      }

      const filename = uploadFilename || blob.originalFilename || 'file.pptx';
      const extFromName = filename.split('.').pop()?.toLowerCase();
      const isPptxUpload =
        mimetype?.includes('presentationml') || extFromName === 'pptx';

      await db
        .update(blobs)
        .set({
          contentSha256: shaHex,
          storageKey: key,
          sizeBytes: buf.length,
          mimeType: mimetype || blob.mimeType,
          updatedAt: sql`now()`,
          updatedBy: getActor(request),
          ...(isPptxUpload
            ? { originalExt: 'pptx', originalFilename: filename }
            : {}),
        })
        .where(eq(blobs.id, id));

      const [updated] = await db.select().from(blobs).where(eq(blobs.id, id));

      return {
        blobId: id,
        sha256: shaHex,
        sizeBytes: buf.length,
        updatedAt: updated?.updatedAt ?? null,
        updatedBy: updated?.updatedBy ?? null,
      };
    },
  );

  app.post('/v1/uploads', async (request, reply) => {
    const uploaded = await readMultipartFileBuffer(request, 'file');
    if (!uploaded) {
      return reply.code(400).send({ error: 'missing_file' });
    }

    const meta = readUploadMetadata(request);
    const { buffer: buf, filename, mimetype } = uploaded;

    if (buf.length > maxUploadBytes) {
      return reply.code(413).send({ error: 'file_too_large' });
    }

    const ext =
      filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'bin';

    try {
      return await persistBlobFromBuffer({
        db,
        storage,
        buf,
        mimeType: mimetype,
        filename,
        ext,
        ...meta,
        uploadedBy: getActor(request),
      });
    } catch (err) {
      if (err instanceof ContentAlreadyExistsError) {
        return reply.code(409).send({ error: 'content_already_exists' });
      }
      throw err;
    }
  });

  type CreateJobBody = {
    inputs: { blobId: string; order?: number }[];
    webhookUrl?: string;
  };

  function parseWebhookUrl(raw: string | undefined): string | null | 'invalid' {
    if (!raw?.trim()) return null;
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'invalid';
      return u.toString();
    } catch {
      return 'invalid';
    }
  }

  app.post<{ Body: CreateJobBody }>('/v1/jobs', async (request, reply) => {
    const body = request.body;
    if (!body?.inputs?.length) {
      return reply.code(400).send({ error: 'inputs_required' });
    }

    const webhookUrl = parseWebhookUrl(body.webhookUrl);
    if (webhookUrl === 'invalid') {
      return reply.code(400).send({ error: 'invalid_webhook_url' });
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
      .values({ status: 'queued', progress: 0, webhookUrl: webhookUrl ?? undefined })
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
      progress: job.progress ?? 0,
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

  app.put<{ Params: { id: string } }>(
    '/v1/jobs/:id/output',
    async (request, reply) => {
      const id = request.params.id;
      const [job] = await db.select().from(mergeJobs).where(eq(mergeJobs.id, id));
      if (!job || job.status !== 'succeeded' || !job.outputKey) {
        return reply.code(404).send({ error: 'not_ready' });
      }
      if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
        return reply.code(410).send({ error: 'expired' });
      }

      const uploaded = await readMultipartFileBuffer(request, 'file');
      if (!uploaded) return reply.code(400).send({ error: 'missing_file' });

      const { buffer: buf } = uploaded;

      await storage.putObject(
        job.outputKey,
        buf,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );

      return { jobId: id, sizeBytes: buf.length };
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

  await registerStaticAssets(app);

  return app;
}

async function main() {
  const app = await buildApp();
  const env = loadApiEnv();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

export default buildApp;

if (!process.env.VERCEL) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
