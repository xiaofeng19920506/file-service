/**
 * 从主模板抽出 1–12 月生日页到独立库，并删掉主模板内 slide39–50。
 * 主模板保留 slide24 作为生日锚点（由库中当月页 splice 覆盖）。
 *
 * 用法：npx tsx scripts/extract-birthday-month-library.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { extractSlidesByFileNumbersAsPptx } from '../shared/src/pptx-extract-slide.js';
import { removeSlidesFromPptxZip } from '../shared/src/pptx-duplicate-slide.js';
import {
  BIRTHDAY_MONTHS,
  BIRTHDAY_MONTH_SLIDE_MAP,
  birthdayMonthLibraryFileName,
} from '../shared/src/bulletin-birthday-months.js';

const root = join(import.meta.dirname, '..');
const templatePath = join(root, 'shared/templates/bulletin/06_14_2026.pptx');
const libraryDir = join(root, 'shared/templates/bulletin/birthday');

async function main() {
  const templateBuf = readFileSync(templatePath);
  const zip = await JSZip.loadAsync(templateBuf);

  mkdirSync(libraryDir, { recursive: true });

  for (const month of BIRTHDAY_MONTHS) {
    const slideNum = BIRTHDAY_MONTH_SLIDE_MAP[month];
    const path = `ppt/slides/slide${slideNum}.xml`;
    if (!zip.file(path)) {
      throw new Error(`missing ${path}; run expand-birthday-month-slides first or restore template`);
    }
    const mini = await extractSlidesByFileNumbersAsPptx(templateBuf, [slideNum]);
    const outName = birthdayMonthLibraryFileName(month);
    const outPath = join(libraryDir, outName);
    writeFileSync(outPath, mini);
    console.log(`month ${month} <- slide${slideNum} -> birthday/${outName}`);
  }

  const removePaths = BIRTHDAY_MONTHS.map(
    (m) => `ppt/slides/slide${BIRTHDAY_MONTH_SLIDE_MAP[m]}.xml`,
  );
  await removeSlidesFromPptxZip(zip, removePaths);
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(templatePath, out);
  console.log(`removed slides 39–50 from ${templatePath}; total bytes ${out.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
