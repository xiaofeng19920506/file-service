import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { files, uploadSessions } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import {
  chunkExists,
  mergeChunksStream,
  newStorageKey,
  removeChunkDir,
  storedFilePath,
} from "@/lib/storage";
import { safeExt } from "@/lib/upload-utils";
import fs from "node:fs/promises";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  uploadId: z.string().uuid(),
});

async function returnMergedFile(db: ReturnType<typeof getDb>, fileId: string) {
  const [existing] = await db
    .select({
      id: files.id,
      originalName: files.originalName,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      source: files.source,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  return existing;
}

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
    return Response.json({ error: "uploadId 无效" }, { status: 400 });
  }
  const { uploadId } = parsed.data;

  const db = getDb();

  let [session] = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.id, uploadId))
    .limit(1);

  if (!session) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }

  if (session.status === "merged" && session.mergedFileId) {
    const existing = await returnMergedFile(db, session.mergedFileId);
    if (existing) {
      return Response.json({ file: existing, idempotent: true });
    }
  }

  if (session.status === "merging" && !session.mergedFileId) {
    await db
      .update(uploadSessions)
      .set({ status: "uploading" })
      .where(eq(uploadSessions.id, uploadId));
    session = { ...session, status: "uploading" };
  }

  if (session.status !== "uploading") {
    if (session.status === "merging") {
      return Response.json(
        { error: "另一合并请求正在进行，请稍后重试" },
        { status: 409 }
      );
    }
    return Response.json(
      { error: "会话状态不允许合并", status: session.status },
      { status: 409 }
    );
  }

  const claim = await db
    .update(uploadSessions)
    .set({ status: "merging" })
    .where(
      and(
        eq(uploadSessions.id, uploadId),
        eq(uploadSessions.status, "uploading")
      )
    )
    .returning({ id: uploadSessions.id });

  if (claim.length === 0) {
    const [again] = await db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, uploadId))
      .limit(1);
    if (again?.status === "merged" && again.mergedFileId) {
      const existing = await returnMergedFile(db, again.mergedFileId);
      if (existing) {
        return Response.json({ file: existing, idempotent: true });
      }
    }
    if (again?.status === "merging") {
      return Response.json(
        { error: "另一合并请求正在进行，请稍后重试" },
        { status: 409 }
      );
    }
    return Response.json({ error: "无法开始合并" }, { status: 409 });
  }

  const rollbackUploading = async () => {
    await db
      .update(uploadSessions)
      .set({ status: "uploading" })
      .where(
        and(
          eq(uploadSessions.id, uploadId),
          eq(uploadSessions.status, "merging")
        )
      );
  };

  for (let i = 0; i < session.totalChunks; i++) {
    if (!(await chunkExists(env, uploadId, i))) {
      await rollbackUploading();
      return Response.json(
        { error: `缺少分片 ${i}`, receivedBelow: i },
        { status: 400 }
      );
    }
  }

  const ext = safeExt(session.originalName);
  const storageKey = newStorageKey(ext);
  const dest = storedFilePath(env, storageKey);

  let mergedSize: number;
  try {
    mergedSize = await mergeChunksStream(
      env,
      uploadId,
      session.totalChunks,
      dest
    );
  } catch {
    await fs.unlink(dest).catch(() => {});
    await rollbackUploading();
    return Response.json({ error: "合并写入失败" }, { status: 500 });
  }

  if (mergedSize !== session.totalSize) {
    await fs.unlink(dest).catch(() => {});
    await rollbackUploading();
    return Response.json(
      {
        error: "合并后大小与会话声明不一致",
        expectedBytes: session.totalSize,
        actualBytes: mergedSize,
      },
      { status: 400 }
    );
  }

  if (mergedSize > env.MAX_UPLOAD_BYTES) {
    await fs.unlink(dest).catch(() => {});
    await rollbackUploading();
    return Response.json({ error: "合并后超过大小上限" }, { status: 413 });
  }

  const [fileRow] = await db
    .insert(files)
    .values({
      originalName: session.originalName,
      storageKey,
      sizeBytes: mergedSize,
      mimeType: session.mimeType,
      source: "chunked",
    })
    .returning({
      id: files.id,
      originalName: files.originalName,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      source: files.source,
      createdAt: files.createdAt,
    });

  if (!fileRow) {
    await fs.unlink(dest).catch(() => {});
    await rollbackUploading();
    return Response.json({ error: "数据库写入失败" }, { status: 500 });
  }

  const finalized = await db
    .update(uploadSessions)
    .set({
      status: "merged",
      mergedFileId: fileRow.id,
    })
    .where(
      and(
        eq(uploadSessions.id, uploadId),
        eq(uploadSessions.status, "merging")
      )
    )
    .returning({ id: uploadSessions.id });

  if (finalized.length === 0) {
    await db.delete(files).where(eq(files.id, fileRow.id));
    await fs.unlink(dest).catch(() => {});
    await rollbackUploading();
    return Response.json({ error: "合并完成状态更新失败" }, { status: 500 });
  }

  await removeChunkDir(env, uploadId);

  return Response.json({ file: fileRow });
}
