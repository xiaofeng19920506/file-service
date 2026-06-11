import type { FastifyRequest } from 'fastify';

type AttachedPart = {
  type?: 'file' | 'field';
  toBuffer?: () => Promise<Buffer>;
  file?: NodeJS.ReadableStream;
  filename?: string;
  mimetype?: string;
  value?: unknown;
};

function getAttachedPart(
  request: FastifyRequest,
  fieldName: string,
): AttachedPart | undefined {
  const body = request.body as Record<string, AttachedPart | AttachedPart[]> | undefined;
  if (!body) return undefined;
  const part = body[fieldName];
  if (Array.isArray(part)) return part[0];
  return part;
}

function fieldText(part: AttachedPart | undefined): string | null {
  if (!part) return null;
  if (part.type === 'field' && typeof part.value === 'string') {
    const trimmed = part.value.trim();
    return trimmed || null;
  }
  return null;
}

export function readMultipartTextField(
  request: FastifyRequest,
  fieldName: string,
): string | null {
  return fieldText(getAttachedPart(request, fieldName));
}

export function readUploadMetadata(request: FastifyRequest) {
  return {
    title: readMultipartTextField(request, 'title'),
    titleEn: readMultipartTextField(request, 'titleEn'),
    titleZhCn: readMultipartTextField(request, 'titleZhCn'),
    titleZhTw: readMultipartTextField(request, 'titleZhTw'),
    composer: readMultipartTextField(request, 'composer'),
    author: readMultipartTextField(request, 'author'),
    notes: readMultipartTextField(request, 'notes'),
  };
}

/** Read an uploaded file field; supports attachFieldsToBody and classic request.file(). */
export async function readMultipartFileBuffer(
  request: FastifyRequest,
  fieldName: string,
): Promise<{ buffer: Buffer; filename: string; mimetype: string } | null> {
  const attached = getAttachedPart(request, fieldName);
  if (attached?.type === 'file') {
    if (attached.toBuffer) {
      const buffer = await attached.toBuffer();
      if (!buffer.length) return null;
      return {
        buffer,
        filename: attached.filename ?? 'upload.bin',
        mimetype: attached.mimetype ?? 'application/octet-stream',
      };
    }
    if (attached.file) {
      const parts: Buffer[] = [];
      for await (const chunk of attached.file) {
        parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(parts);
      if (!buffer.length) return null;
      return {
        buffer,
        filename: attached.filename ?? 'upload.bin',
        mimetype: attached.mimetype ?? 'application/octet-stream',
      };
    }
  }

  const mp = await request.file();
  if (!mp || mp.fieldname !== fieldName) {
    if (mp?.file) {
      mp.file.resume();
    }
    return null;
  }

  const parts: Buffer[] = [];
  for await (const chunk of mp.file) {
    parts.push(chunk);
  }
  const buffer = Buffer.concat(parts);
  if (!buffer.length) return null;
  return {
    buffer,
    filename: mp.filename,
    mimetype: mp.mimetype,
  };
}
