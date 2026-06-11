import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  DEFAULT_UPLOAD_CHUNK_SIZE,
  UPLOAD_SESSION_TTL_MS,
  type Db,
} from '@file-service/shared';
import type { ObjectStorage } from '@file-service/shared';
import { ContentAlreadyExistsError, persistBlobFromBuffer } from './blob-store.js';
import { readMultipartFileBuffer } from './multipart-read.js';

type UploadSession = {
  uploadId: string;
  filename: string;
  ext: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  received: Set<number>;
  dir: string;
  createdAt: number;
  title?: string | null;
  titleEn?: string | null;
  titleZhCn?: string | null;
  titleZhTw?: string | null;
  composer?: string | null;
  author?: string | null;
  notes?: string | null;
};

const sessions = new Map<string, UploadSession>();

function parseExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'bin';
}

async function concatChunks(
  session: UploadSession,
): Promise<{ buf: Buffer; sha256: string }> {
  const ws_path = join(session.dir, 'assembled');
  const ws = createWriteStream(ws_path);
  const hash = createHash('sha256');

  for (let i = 0; i < session.totalChunks; i++) {
    const chunkPath = join(session.dir, `chunk-${i}`);
    const data = await readFile(chunkPath);
    hash.update(data);
    if (!ws.write(data)) {
      await new Promise<void>((res) => ws.once('drain', res));
    }
  }
  ws.end();
  await finished(ws);

  const buf = await readFile(ws_path);
  if (buf.length !== session.size) {
    throw new Error('size_mismatch');
  }
  return { buf, sha256: hash.digest('hex') };
}

export async function sweepExpiredUploadSessions(): Promise<void> {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > UPLOAD_SESSION_TTL_MS) {
      sessions.delete(id);
      await rm(session.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export function registerChunkUploadRoutes(
  app: FastifyInstance,
  deps: {
    db: Db;
    storage: ObjectStorage;
    maxUploadBytes: number;
    getActor: (request: FastifyRequest) => string;
  },
) {
  type InitBody = {
    filename: string;
    size: number;
    chunkSize?: number;
    title?: string;
    titleEn?: string;
    titleZhCn?: string;
    titleZhTw?: string;
    composer?: string;
    author?: string;
    notes?: string;
  };

  app.post<{ Body: InitBody }>('/v1/uploads/init', async (request, reply) => {
    const body = request.body;
    if (!body?.filename || typeof body.size !== 'number' || body.size <= 0) {
      return reply.code(400).send({ error: 'invalid_init' });
    }
    if (body.size > deps.maxUploadBytes) {
      return reply.code(413).send({ error: 'file_too_large' });
    }

    const chunkSize = Math.min(
      deps.maxUploadBytes,
      Math.max(256 * 1024, body.chunkSize ?? DEFAULT_UPLOAD_CHUNK_SIZE),
    );
    const totalChunks = Math.ceil(body.size / chunkSize);
    const uploadId = randomUUID();
    const dir = join(tmpdir(), 'fs-chunk', uploadId);
    await mkdir(dir, { recursive: true });

    sessions.set(uploadId, {
      uploadId,
      filename: body.filename,
      ext: parseExt(body.filename),
      size: body.size,
      chunkSize,
      totalChunks,
      received: new Set(),
      dir,
      createdAt: Date.now(),
      title: typeof body.title === 'string' ? body.title.trim() : null,
      titleEn: typeof body.titleEn === 'string' ? body.titleEn.trim() : null,
      titleZhCn: typeof body.titleZhCn === 'string' ? body.titleZhCn.trim() : null,
      titleZhTw: typeof body.titleZhTw === 'string' ? body.titleZhTw.trim() : null,
      composer: typeof body.composer === 'string' ? body.composer.trim() : null,
      author: typeof body.author === 'string' ? body.author.trim() : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() : null,
    });

    return { uploadId, chunkSize, totalChunks };
  });

  app.post<{ Params: { uploadId: string; index: string } }>(
    '/v1/uploads/:uploadId/chunks/:index',
    async (request, reply) => {
      const session = sessions.get(request.params.uploadId);
      if (!session) return reply.code(404).send({ error: 'upload_not_found' });

      const index = parseInt(request.params.index, 10);
      if (!Number.isFinite(index) || index < 0 || index >= session.totalChunks) {
        return reply.code(400).send({ error: 'invalid_chunk_index' });
      }

      const uploaded = await readMultipartFileBuffer(request, 'chunk');
      if (!uploaded) return reply.code(400).send({ error: 'missing_chunk' });

      const buf = uploaded.buffer;
      if (buf.length === 0) return reply.code(400).send({ error: 'empty_chunk' });

      const expectedLen =
        index === session.totalChunks - 1
          ? session.size - session.chunkSize * (session.totalChunks - 1)
          : session.chunkSize;
      if (buf.length > expectedLen) {
        return reply.code(400).send({ error: 'chunk_too_large' });
      }

      await writeFile(join(session.dir, `chunk-${index}`), buf);
      session.received.add(index);
      return { received: session.received.size, totalChunks: session.totalChunks };
    },
  );

  app.post<{ Params: { uploadId: string } }>(
    '/v1/uploads/:uploadId/complete',
    async (request, reply) => {
      const session = sessions.get(request.params.uploadId);
      if (!session) return reply.code(404).send({ error: 'upload_not_found' });

      if (session.received.size !== session.totalChunks) {
        return reply.code(400).send({
          error: 'incomplete_upload',
          received: session.received.size,
          totalChunks: session.totalChunks,
        });
      }

      try {
        const { buf } = await concatChunks(session);

        const result = await persistBlobFromBuffer({
          db: deps.db,
          storage: deps.storage,
          buf,
          mimeType: null,
          filename: session.filename,
          ext: session.ext,
          title: session.title,
          titleEn: session.titleEn,
          titleZhCn: session.titleZhCn,
          titleZhTw: session.titleZhTw,
          composer: session.composer,
          author: session.author,
          notes: session.notes,
          uploadedBy: deps.getActor(request),
        });

        return result;
      } catch (err) {
        if (err instanceof ContentAlreadyExistsError) {
          return reply.code(409).send({ error: 'content_already_exists' });
        }
        request.log.error(err);
        return reply.code(500).send({ error: 'upload_failed' });
      }
    },
  );
}
