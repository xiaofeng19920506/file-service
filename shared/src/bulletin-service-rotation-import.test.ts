import JSZip from 'jszip';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseServiceRotationXlsx,
  serviceRotationScheduleId,
  writeServiceRotationScheduleFiles,
} from './bulletin-service-rotation-import.js';

async function buildMinimalRotationXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
  );

  // shared: 0 唐毅, 1 惠美, 2 讀經, 3 聖餐, 4 王燕群 姊妹, 5 音控, 6 振成, Wilson
  const shared = ['唐毅', '惠美', '讀經', '聖餐', '王燕群 姊妹', '音控', '振成, Wilson'];
  zip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">
${shared.map((t) => `<si><t>${t}</t></si>`).join('\n')}
</sst>`,
  );

  // row 4: date serial 46208 = 2026-07-05; cols B=chair C=usher D=scripture E=communion G=worship H=sound L=cleaning
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="4">
      <c r="A4"><v>46208</v></c>
      <c r="B4" t="s"><v>0</v></c>
      <c r="C4" t="s"><v>1</v></c>
      <c r="D4" t="s"><v>2</v></c>
      <c r="E4" t="s"><v>3</v></c>
      <c r="G4" t="s"><v>4</v></c>
      <c r="H4" t="s"><v>5</v></c>
      <c r="L4" t="s"><v>6</v></c>
    </row>
    <row r="5">
      <c r="A5"><v>46215</v></c>
      <c r="B5" t="s"><v>0</v></c>
      <c r="C5" t="s"><v>1</v></c>
      <c r="G5" t="s"><v>4</v></c>
      <c r="L5" t="s"><v>6</v></c>
    </row>
  </sheetData>
</worksheet>`,
  );

  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

describe('bulletin-service-rotation-import', () => {
  it('parses xlsx weeks and quarter id', async () => {
    const buf = await buildMinimalRotationXlsx();
    const schedule = await parseServiceRotationXlsx(buf, 'test.xlsx');
    expect(schedule.weeks).toHaveLength(2);
    expect(schedule.weeks[0]?.date).toBe('2026-07-05');
    expect(schedule.weeks[0]?.chair).toBe('唐毅');
    expect(schedule.weeks[0]?.worship).toBe('王燕群 姊妹');
    expect(schedule.weeks[0]?.cleaning).toBe('振成, Wilson');
    expect(schedule.weeks[1]?.date).toBe('2026-07-12');
    expect(schedule.quarter).toEqual({ year: 2026, startMonth: 7, endMonth: 7 });
    expect(serviceRotationScheduleId(schedule.quarter)).toBe('2026-q3');
  });

  it('writes schedule + active.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rot-import-'));
    try {
      const buf = await buildMinimalRotationXlsx();
      const schedule = await parseServiceRotationXlsx(buf);
      const { id, path } = await writeServiceRotationScheduleFiles(schedule, dir);
      expect(id).toBe('2026-q3');
      const written = JSON.parse(readFileSync(path, 'utf8'));
      expect(written.weeks).toHaveLength(2);
      const active = JSON.parse(readFileSync(join(dir, 'active.json'), 'utf8'));
      expect(active.id).toBe('2026-q3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
