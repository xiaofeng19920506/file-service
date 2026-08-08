/**
 * 从「Jan - Dec.pptx」抽出 1–12 月生日页到月库。
 * 演示顺序：第 3–14 页 = 1–12 月。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPresentationSlideAsPptx } from './pptx-extract-slide.js';
import {
  BIRTHDAY_MONTHS,
  birthdayMonthLibraryFileName,
} from './bulletin-birthday-months.js';

export function resolveBirthdayMonthLibraryDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '../templates/bulletin/birthday');
}

/** 将 Jan–Dec 源 PPTX 写入 month-01…12 */
export async function importBirthdayMonthsFromJanDecPptx(
  pptx: Buffer | Uint8Array,
  libraryDir?: string,
): Promise<{ month: number; path: string; bytes: number }[]> {
  const dir = libraryDir ?? resolveBirthdayMonthLibraryDir();
  mkdirSync(dir, { recursive: true });
  const results: { month: number; path: string; bytes: number }[] = [];

  for (const month of BIRTHDAY_MONTHS) {
    const presentationIndex = month + 2;
    const mini = await extractPresentationSlideAsPptx(pptx, presentationIndex);
    const outName = birthdayMonthLibraryFileName(month);
    const outPath = join(dir, outName);
    writeFileSync(outPath, mini);
    results.push({ month, path: outPath, bytes: mini.length });
  }
  return results;
}
