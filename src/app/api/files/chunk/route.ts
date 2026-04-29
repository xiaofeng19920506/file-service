import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { uploadSessions } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { chunkExists, writeChunk } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const env = getServerEnv();
  const formData = await request.formData();
  const uploadId = formData.get("uploadId");
  const indexRaw = formData.get("index");
  const chunk = formData.get("chunk");

  if (typeof uploadId !== "string" || !uploadId) {
    return Response.json({ error: "缺少 uploadId" }, { status: 400 });
  }
  if (typeof indexRaw !== "string" && typeof indexRaw !== "number") {
    return Response.json({ error: "缺少 index" }, { status: 400 });
  }
  const index = typeof indexRaw === "number" ? indexRaw : parseInt(indexRaw, 10);
  if (!Number.isFinite(index) || index < 0) {
    return Response.json({ error: "index 无效" }, { status: 400 });
  }
  if (!chunk || !(chunk instanceof File)) {
    return Response.json({ error: "缺少 chunk 文件" }, { status: 400 });
  }

  const buf = Buffer.from(await chunk.arrayBuffer());
  if (buf.length === 0) {
    return Response.json({ error: "分片为空" }, { status: 400 });
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(
      and(eq(uploadSessions.id, uploadId), eq(uploadSessions.status, "uploading"))
    )
    .limit(1);

  if (!session) {
    return Response.json({ error: "会话不存在或已结束" }, { status: 404 });
  }
  if (index >= session.totalChunks) {
    return Response.json({ error: "index 超出范围" }, { status: 400 });
  }
  if (buf.length > env.MAX_UPLOAD_BYTES) {
    return Response.json({ error: "分片过大" }, { status: 413 });
  }

  await writeChunk(env, uploadId, index, buf);

  let received = 0;
  for (let i = 0; i < session.totalChunks; i++) {
    if (await chunkExists(env, uploadId, i)) received++;
  }

  return Response.json({
    uploadId,
    index,
    sizeBytes: buf.length,
    receivedChunks: received,
    totalChunks: session.totalChunks,
    readyToMerge: received === session.totalChunks,
  });
}
