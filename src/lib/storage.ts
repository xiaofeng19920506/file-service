import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { ServerEnv } from "./env";

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function chunkDir(env: ServerEnv, sessionId: string) {
  return path.join(env.CHUNK_STORAGE_DIR, sessionId);
}

export function chunkPath(env: ServerEnv, sessionId: string, index: number) {
  return path.join(chunkDir(env, sessionId), String(index));
}

export async function writeChunk(
  env: ServerEnv,
  sessionId: string,
  index: number,
  data: Buffer
) {
  const dir = chunkDir(env, sessionId);
  await ensureDir(dir);
  const p = chunkPath(env, sessionId, index);
  await fs.writeFile(p, data);
}

export async function chunkExists(
  env: ServerEnv,
  sessionId: string,
  index: number
) {
  try {
    await fs.stat(chunkPath(env, sessionId, index));
    return true;
  } catch {
    return false;
  }
}

export async function removeChunkDir(env: ServerEnv, sessionId: string) {
  const dir = chunkDir(env, sessionId);
  await fs.rm(dir, { recursive: true, force: true });
}

/** 流式合并大文件，避免整段读入内存 */
export async function mergeChunksStream(
  env: ServerEnv,
  sessionId: string,
  totalChunks: number,
  destAbsolutePath: string
): Promise<number> {
  await ensureDir(path.dirname(destAbsolutePath));
  let total = 0;
  const out = createWriteStream(destAbsolutePath);
  try {
    for (let i = 0; i < totalChunks; i++) {
      const p = chunkPath(env, sessionId, i);
      const st = await fs.stat(p);
      total += st.size;
      const rs = (await import("node:fs")).createReadStream(p);
      await pipeline(rs, out, { end: false });
    }
    await new Promise<void>((resolve, reject) => {
      out.end((err: NodeJS.ErrnoException | null) =>
        err ? reject(err) : resolve()
      );
    });
    return total;
  } catch (e) {
    out.destroy();
    throw e;
  }
}

export function storedFilePath(env: ServerEnv, storageKey: string) {
  return path.join(env.FILE_STORAGE_DIR, storageKey);
}

export async function saveDirectFile(
  env: ServerEnv,
  data: Buffer,
  storageKey: string
) {
  const full = storedFilePath(env, storageKey);
  await ensureDir(path.dirname(full));
  await fs.writeFile(full, data);
}

export function newStorageKey(ext: string) {
  const safe =
    ext && /^[.a-zA-Z0-9]+$/.test(ext) && ext.length <= 16 ? ext : "";
  const id = crypto.randomUUID();
  return safe ? `${id}${safe}` : id;
}
