/**
 * 生日月库 / 服事轮值内容指纹，用于预览缓存失效。
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { birthdayMonthLibraryFileName, BIRTHDAY_MONTHS } from './bulletin-birthday-months.js';

function resolveTemplateRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '../templates/bulletin');
}

function fileFingerprint(path: string): string {
  if (!existsSync(path)) return 'missing';
  const st = statSync(path);
  return `${st.size}:${Math.floor(st.mtimeMs)}`;
}

/** 生日月库 12 页 + 轮值 JSON 的短指纹（mtime/size） */
export function bulletinLibraryContentRev(rootDir?: string): string {
  const root = rootDir ?? resolveTemplateRoot();
  const parts: string[] = [];
  for (const month of BIRTHDAY_MONTHS) {
    parts.push(
      `b${month}:${fileFingerprint(join(root, 'birthday', birthdayMonthLibraryFileName(month)))}`,
    );
  }
  const rotDir = join(root, 'service-rotation');
  if (existsSync(rotDir)) {
    const names = readdirSync(rotDir)
      .filter((n) => n.endsWith('.json'))
      .sort();
    for (const name of names) {
      parts.push(`r:${name}:${fileFingerprint(join(rotDir, name))}`);
    }
  }
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/** 可选：完整 md5（测试用） */
export function bulletinLibraryContentMd5(rootDir?: string): string {
  const root = rootDir ?? resolveTemplateRoot();
  const hash = createHash('md5');
  for (const month of BIRTHDAY_MONTHS) {
    const path = join(root, 'birthday', birthdayMonthLibraryFileName(month));
    if (existsSync(path)) hash.update(readFileSync(path));
  }
  const rotDir = join(root, 'service-rotation');
  if (existsSync(rotDir)) {
    for (const name of readdirSync(rotDir).filter((n) => n.endsWith('.json')).sort()) {
      hash.update(readFileSync(join(rotDir, name)));
    }
  }
  return hash.digest('hex');
}
