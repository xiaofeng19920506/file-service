/**
 * 从 Excel 服事轮值表生成 shared/templates/bulletin/service-rotation/<id>.json
 *
 * 用法：
 *   npx tsx scripts/import-service-rotation-xlsx.ts "/path/to/rotation.xlsx"
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  parseServiceRotationXlsx,
  writeServiceRotationScheduleFiles,
} from '../shared/src/bulletin-service-rotation-import.js';

const root = join(import.meta.dirname, '..');
const xlsxPath = process.argv[2];

if (!xlsxPath) {
  console.error('Usage: npx tsx scripts/import-service-rotation-xlsx.ts <xlsx>');
  process.exit(1);
}

async function main() {
  const buf = readFileSync(xlsxPath);
  const schedule = await parseServiceRotationXlsx(buf, basename(xlsxPath));
  const outDir = join(root, 'shared/templates/bulletin/service-rotation');
  const { id, path } = await writeServiceRotationScheduleFiles(schedule, outDir);
  console.log(`Wrote ${path} (id=${id}, weeks=${schedule.weeks.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
