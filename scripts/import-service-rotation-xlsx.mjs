#!/usr/bin/env node
/**
 * 从 Excel 服事轮值表生成 shared/templates/bulletin/service-rotation/<id>.json
 *
 * 用法：
 *   node scripts/import-service-rotation-xlsx.mjs \
 *     "/path/to/2026年 7月 - 9月 各項服事輪值表.xlsx" \
 *     2026-q3
 *
 * 依赖系统 Python3（标准库即可，无 pip）。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const xlsxPath = process.argv[2];
const outId = process.argv[3] || '2026-q3';

if (!xlsxPath) {
  console.error('Usage: node scripts/import-service-rotation-xlsx.mjs <xlsx> [out-id]');
  process.exit(1);
}

const py = `
import zipfile, xml.etree.ElementTree as ET, json, sys
from datetime import datetime, timedelta
from pathlib import Path

path = Path(sys.argv[1])
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

with zipfile.ZipFile(path) as z:
  shared = []
  if 'xl/sharedStrings.xml' in z.namelist():
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in root.findall('m:si', ns):
      texts = [t.text or '' for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')]
      shared.append(''.join(texts))
  wb = ET.fromstring(z.read('xl/workbook.xml'))
  sheets = []
  for sh in wb.findall('m:sheets/m:sheet', ns):
    sheets.append((sh.attrib.get('name'), sh.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')))
  rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
  rid_to_target = {rel.attrib['Id']: rel.attrib['Target'] for rel in rels}

  def col_row(ref):
    col=''; row=''
    for c in ref:
      if c.isalpha(): col+=c
      else: row+=c
    n=0
    for ch in col:
      n=n*26+(ord(ch)-64)
    return n, int(row)

  name, rid = sheets[0]
  target = rid_to_target[rid]
  if not target.startswith('xl/'): target = 'xl/' + target
  root = ET.fromstring(z.read(target))
  cells = {}
  max_r=0
  for c in root.findall('.//m:c', ns):
    ref = c.attrib.get('r')
    if not ref: continue
    col,row = col_row(ref)
    max_r=max(max_r,row)
    t = c.attrib.get('t')
    v = c.find('m:v', ns)
    is_el = c.find('m:is', ns)
    val = ''
    if t == 's' and v is not None and v.text is not None:
      val = shared[int(v.text)]
    elif t == 'inlineStr' and is_el is not None:
      texts = [t.text or '' for t in is_el.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')]
      val = ''.join(texts)
    elif v is not None and v.text is not None:
      val = v.text
    cells[(row,col)] = val

base = datetime(1899, 12, 30)
weeks = []
for r in range(4, max_r+1):
  serial = cells.get((r,1), '')
  if not serial: continue
  d = base + timedelta(days=float(serial))
  def g(c, _r=r):
    return str(cells.get((_r,c), '') or '').strip()
  weeks.append({
    'date': d.strftime('%Y-%m-%d'),
    'chair': g(2),
    'usher': g(3),
    'scripture': g(4),
    'communionOrTestimony': g(5),
    'worship': g(7),
    'sound': g(8),
    'cleaning': g(12),
  })

months = sorted({int(w['date'][5:7]) for w in weeks})
year = int(weeks[0]['date'][:4]) if weeks else 2026
out = {
  'source': path.name,
  'quarter': {
    'year': year,
    'startMonth': months[0] if months else 1,
    'endMonth': months[-1] if months else 12,
  },
  'weeks': weeks,
}
print(json.dumps(out, ensure_ascii=False, indent=2))
`;

const result = spawnSync('python3', ['-c', py, xlsxPath], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'python failed');
  process.exit(result.status ?? 1);
}

const outDir = join(root, 'shared/templates/bulletin/service-rotation');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${outId}.json`);
writeFileSync(outFile, `${result.stdout.trim()}\n`, 'utf8');
console.log(`Wrote ${outFile}`);
