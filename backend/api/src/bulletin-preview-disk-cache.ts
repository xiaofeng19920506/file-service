import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_DISK_ENTRIES = 400;
const MAX_DISK_BYTES = 512 * 1024 * 1024; // 512MB soft cap

function resolvePreviewCacheDir(): string {
  const candidates = [
    join(process.cwd(), 'data/cache/bulletin-preview'),
    join(process.cwd(), '../data/cache/bulletin-preview'),
  ];
  return candidates[0]!;
}

function fileNameForKey(cacheKey: string): string {
  return createHash('sha256').update(cacheKey).digest('hex') + '.bin';
}

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/** 从磁盘读取预览缓存（PNG 或 patched PPTX） */
export async function readBulletinPreviewDiskCache(cacheKey: string): Promise<Buffer | null> {
  const dir = resolvePreviewCacheDir();
  const path = join(dir, fileNameForKey(cacheKey));
  try {
    if (!existsSync(path)) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

/** 写入磁盘并做简单 LRU 淘汰（按 mtime） */
export async function writeBulletinPreviewDiskCache(
  cacheKey: string,
  buf: Buffer,
): Promise<void> {
  const dir = resolvePreviewCacheDir();
  try {
    await ensureDir(dir);
    const path = join(dir, fileNameForKey(cacheKey));
    await writeFile(path, buf);
    await pruneDiskCache(dir);
  } catch {
    // 磁盘缓存失败不影响主路径
  }
}

async function pruneDiskCache(dir: string): Promise<void> {
  let entries: { name: string; path: string; mtimeMs: number; size: number }[] = [];
  try {
    const names = await readdir(dir);
    for (const name of names) {
      if (!name.endsWith('.bin')) continue;
      const path = join(dir, name);
      try {
        const st = await stat(path);
        entries.push({ name, path, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        // skip
      }
    }
  } catch {
    return;
  }

  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
  let totalBytes = entries.reduce((s, e) => s + e.size, 0);

  while (
    entries.length > MAX_DISK_ENTRIES ||
    (totalBytes > MAX_DISK_BYTES && entries.length > 0)
  ) {
    const oldest = entries.shift();
    if (!oldest) break;
    totalBytes -= oldest.size;
    await unlink(oldest.path).catch(() => undefined);
  }
}
