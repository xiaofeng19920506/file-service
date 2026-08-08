/**
 * 从「Jan - Dec.pptx」抽出 1–12 月生日页到月库。
 *
 * 用法：
 *   npx tsx scripts/import-birthday-months-from-jan-dec.ts "/path/to/Jan - Dec.pptx"
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importBirthdayMonthsFromJanDecPptx } from '../shared/src/bulletin-birthday-month-import.js';

const root = join(import.meta.dirname, '..');
const libraryDir = join(root, 'shared/templates/bulletin/birthday');
const srcPath = process.argv[2] || join(process.env.HOME ?? '', 'Downloads/Jan - Dec.pptx');

async function main() {
  const buf = readFileSync(srcPath);
  const results = await importBirthdayMonthsFromJanDecPptx(buf, libraryDir);
  for (const row of results) {
    console.log(
      `month ${row.month} <- presentation slide ${row.month + 2} -> ${row.path} (${row.bytes} bytes)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
