import { getDb } from "@/db";
import { uploadSessions } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { ensureDir } from "@/lib/storage";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  originalName: z.string().min(1).max(512),
  mimeType: z.string().max(256).optional().nullable(),
  totalSize: z.number().int().positive(),
  totalChunks: z.number().int().min(1).max(10_000),
});

export async function POST(request: Request) {
  const env = getServerEnv();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "无效 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "参数无效", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { originalName, mimeType, totalSize, totalChunks } = parsed.data;
  if (totalSize > env.MAX_UPLOAD_BYTES) {
    return Response.json({ error: "超过大小上限" }, { status: 413 });
  }

  await ensureDir(env.CHUNK_STORAGE_DIR);

  const db = getDb();
  const [session] = await db
    .insert(uploadSessions)
    .values({
      originalName,
      mimeType: mimeType ?? null,
      totalSize,
      totalChunks,
      status: "uploading",
    })
    .returning({
      id: uploadSessions.id,
      originalName: uploadSessions.originalName,
      totalSize: uploadSessions.totalSize,
      totalChunks: uploadSessions.totalChunks,
      status: uploadSessions.status,
      createdAt: uploadSessions.createdAt,
    });

  return Response.json({ session });
}
