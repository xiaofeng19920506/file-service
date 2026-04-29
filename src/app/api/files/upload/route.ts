import { getDb } from "@/db";
import { files } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { newStorageKey, saveDirectFile, storedFilePath } from "@/lib/storage";
import { safeExt } from "@/lib/upload-utils";
import fs from "node:fs/promises";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const env = getServerEnv();
  const formData = await request.formData();
  const entry = formData.get("file");
  if (!entry || !(entry instanceof File)) {
    return Response.json({ error: "缺少 file 字段" }, { status: 400 });
  }

  const buf = Buffer.from(await entry.arrayBuffer());
  if (buf.length === 0) {
    return Response.json({ error: "文件为空" }, { status: 400 });
  }
  if (buf.length > env.MAX_UPLOAD_BYTES) {
    return Response.json({ error: "超过大小上限" }, { status: 413 });
  }

  const originalName = entry.name || "upload.bin";
  const storageKey = newStorageKey(safeExt(originalName));
  const fullPath = storedFilePath(env, storageKey);

  try {
    await saveDirectFile(env, buf, storageKey);
  } catch {
    return Response.json({ error: "写入磁盘失败" }, { status: 500 });
  }

  const db = getDb();
  const [row] = await db
    .insert(files)
    .values({
      originalName,
      storageKey,
      sizeBytes: buf.length,
      mimeType: entry.type || null,
      source: "direct",
    })
    .returning({
      id: files.id,
      originalName: files.originalName,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      source: files.source,
      createdAt: files.createdAt,
    });

  if (!row) {
    await fs.unlink(fullPath).catch(() => {});
    return Response.json({ error: "数据库写入失败" }, { status: 500 });
  }

  return Response.json({ file: row });
}
