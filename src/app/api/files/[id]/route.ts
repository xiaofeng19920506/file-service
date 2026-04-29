import { eq } from "drizzle-orm";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { getDb } from "@/db";
import { files, uploadSessions } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { storedFilePath } from "@/lib/storage";
import { z } from "zod";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

function dispositionFilename(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").slice(0, 200);
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii || "download"}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "无效的文件 id" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: files.id,
      originalName: files.originalName,
      storageKey: files.storageKey,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
    })
    .from(files)
    .where(eq(files.id, parsed.data))
    .limit(1);

  if (!row) {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }

  const env = getServerEnv();
  const fullPath = storedFilePath(env, row.storageKey);
  try {
    await fs.stat(fullPath);
  } catch {
    return Response.json({ error: "磁盘上找不到该文件" }, { status: 404 });
  }

  const nodeStream = createReadStream(fullPath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": row.mimeType || "application/octet-stream",
      "Content-Disposition": dispositionFilename(row.originalName),
      "Content-Length": String(row.sizeBytes),
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "无效的文件 id" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(eq(files.id, parsed.data))
    .limit(1);

  if (!row) {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }

  const env = getServerEnv();
  const fullPath = storedFilePath(env, row.storageKey);

  await db
    .update(uploadSessions)
    .set({ mergedFileId: null })
    .where(eq(uploadSessions.mergedFileId, row.id));

  await db.delete(files).where(eq(files.id, row.id));

  try {
    await fs.unlink(fullPath);
  } catch {
    /* 记录已从数据库移除，磁盘缺失或已删可忽略 */
  }

  return Response.json({ ok: true, id: row.id });
}
