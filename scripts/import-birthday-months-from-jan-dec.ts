/**
 * 从「Jan - Dec.pptx」抽出 1–12 月生日页到月库。
 * 源文件演示顺序：第 3–14 页 = 1–12 月（第 1–2 页为通用页，15+ 为特别公告）。
 *
 * 用法：
 *   npx tsx scripts/import-birthday-months-from-jan-dec.ts "/path/to/Jan - Dec.pptx"
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPresentationSlideAsPptx } from '../shared/src/pptx-extract-slide.js';
import {
  BIRTHDAY_MONTHS,
  birthdayMonthLibraryFileName,
} from '../shared/src/bulletin-birthday-months.js';

const root = join(import.meta.dirname, '..');
const libraryDir = join(root, 'shared/templates/bulletin/birthday');
const srcPath = process.argv[2] || join(process.env.HOME ?? '', 'Downloads/Jan - Dec.pptx');

async function main() {
  const buf = readFileSync(srcPath);
  mkdirSync(libraryDir, { recursive: true });

  for (const month of BIRTHDAY_MONTHS) {
    // Jan-Dec.pptx：演示第 3 页 = 1 月 … 第 14 页 = 12 月
    const presentationIndex = month + 2;
    const mini = await extractPresentationSlideAsPptx(buf, presentationIndex);
    const outName = birthdayMonthLibraryFileName(month);
    const outPath = join(libraryDir, outName);
    writeFileSync(outPath, mini);
    console.log(`month ${month} <- presentation slide ${presentationIndex} -> birthday/${outName} (${mini.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
