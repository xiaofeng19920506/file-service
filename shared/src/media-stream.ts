import type { FastifyReply } from 'fastify';
import { parseByteRangeHeader } from './http-byte-range.js';
import type { ObjectStorage } from './storage/types.js';

export type StreamBlobMeta = {
  storageKey: string;
  sizeBytes: number;
  mimeType?: string | null;
  filename?: string | null;
};

export async function sendRangedObjectStream(
  reply: FastifyReply,
  storage: ObjectStorage,
  blob: StreamBlobMeta,
  rangeHeader: string | undefined,
): Promise<FastifyReply> {
  const total = blob.sizeBytes;
  const parsed = parseByteRangeHeader(rangeHeader, total);
  const mime = blob.mimeType ?? 'application/octet-stream';
  const filename = blob.filename ?? 'file';

  if (!parsed) {
    const stream = await storage.createReadStream(blob.storageKey);
    return reply
      .header('Content-Type', mime)
      .header('Content-Length', String(total))
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', 'private, max-age=3600')
      .send(stream);
  }

  const { start, end } = parsed;
  const chunkSize = end - start + 1;
  const stream = await storage.createReadStream(blob.storageKey, parsed);

  return reply
    .code(206)
    .header('Content-Type', mime)
    .header('Content-Length', String(chunkSize))
    .header('Content-Range', `bytes ${start}-${end}/${total}`)
    .header('Content-Disposition', `inline; filename="${filename}"`)
    .header('Accept-Ranges', 'bytes')
    .header('Cache-Control', 'private, max-age=3600')
    .send(stream);
}
