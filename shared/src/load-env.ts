import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

function resolveRelativeStorageDir(envDir: string): void {
  const storageDir = process.env.LOCAL_STORAGE_DIR?.trim();
  if (!storageDir || isAbsolute(storageDir)) return;
  process.env.LOCAL_STORAGE_DIR = resolve(envDir, storageDir);
}

/** 从 cwd 向上查找 .env 并加载（不覆盖已有环境变量） */
export function loadEnvFile(): void {
  if (process.env.DOTENV_LOADED === '1') return;

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const envPath = resolve(dir, '.env');
    if (existsSync(envPath)) {
      config({ path: envPath, override: false });
      resolveRelativeStorageDir(dirname(envPath));
      process.env.DOTENV_LOADED = '1';
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
