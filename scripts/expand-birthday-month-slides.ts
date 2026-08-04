/**
 * 一次性：从 P24 复制出 1–12 月生日占位页（slide39–50），追加在 deck 末尾。
 * 正式设计到位后可用 sync:bulletin-template 覆盖，并改 BIRTHDAY_MONTH_SLIDE_MAP。
 *
 * 用法：npx tsx scripts/expand-birthday-month-slides.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { duplicateSlideInZip } from '../shared/src/pptx-duplicate-slide.js';
import { applyIndexedTextReplacementsToSlideXml } from '../shared/src/bulletin-pptx-patch.js';
import { applyBirthdayNameGridToSlideXml } from '../shared/src/bulletin-birthday.js';

const templatePath = join(import.meta.dirname, '../shared/templates/bulletin/06_14_2026.pptx');

function monthTitle(month: number): string {
  return `${month}月份生日的家人們`;
}

async function main() {
  const zip = await JSZip.loadAsync(readFileSync(templatePath));

  if (zip.file('ppt/slides/slide39.xml')) {
    console.log('slides 39–50 already present; skip expand');
    return;
  }

  const source = 'ppt/slides/slide24.xml';
  const created: string[] = [];
  for (let month = 1; month <= 12; month++) {
    // 不传 insertAfterPath → 追加到 sldIdLst 末尾
    const path = await duplicateSlideInZip(zip, source);
    let xml = await zip.file(path)!.async('string');
    xml = applyIndexedTextReplacementsToSlideXml(xml, [{ textIndex: 2, text: monthTitle(month) }]);
    // 清空模板示例名单，留给表单按月写入
    xml = applyBirthdayNameGridToSlideXml(xml, '');
    zip.file(path, xml);
    created.push(path);
    console.log(`month ${month} -> ${path}`);
  }

  const out = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(templatePath, out);
  console.log(`wrote ${created.length} birthday month slides -> ${templatePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
