/**
 * 服事轮值 Excel（.xlsx）→ ServiceRotationSchedule JSON。
 * 列映射与 scripts/import-service-rotation-xlsx.mjs 一致。
 */
import JSZip from 'jszip';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServiceRotationSchedule, ServiceRotationWeek } from './bulletin-service-rotation.js';

/** Excel 序列日起点（1899-12-30） */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function colRow(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref.trim());
  if (!m) return null;
  const colLetters = m[1]!.toUpperCase();
  let col = 0;
  for (const ch of colLetters) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { col, row: Number.parseInt(m[2]!, 10) };
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let si: RegExpExecArray | null;
  while ((si = siRe.exec(xml))) {
    const texts = [...si[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) =>
      decodeXmlEntities(t[1] ?? ''),
    );
    out.push(texts.join(''));
  }
  return out;
}

function excelSerialToIsoDate(serial: number): string {
  const ms = EXCEL_EPOCH_MS + Math.round(serial) * 86_400_000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function cellValue(cellXml: string, shared: string[]): string {
  const t = /\bt="([^"]*)"/.exec(cellXml)?.[1];
  if (t === 's') {
    const v = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
    if (v == null) return '';
    return shared[Number.parseInt(v, 10)] ?? '';
  }
  if (t === 'inlineStr') {
    const texts = [...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
      decodeXmlEntities(m[1] ?? ''),
    );
    return texts.join('');
  }
  const v = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
  return v != null ? decodeXmlEntities(v) : '';
}

/** 从 xlsx buffer 解析轮值表 */
export async function parseServiceRotationXlsx(
  xlsx: Buffer | Uint8Array,
  sourceName = 'rotation.xlsx',
): Promise<ServiceRotationSchedule> {
  const zip = await JSZip.loadAsync(xlsx);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  if (!workbookXml) throw new Error('xlsx_missing_workbook');

  const sheetAttrs = [...workbookXml.matchAll(/<sheet\b([^>]*)\/>|<sheet\b([^>]*)>/g)];
  let rid: string | null = null;
  for (const m of sheetAttrs) {
    const attrs = m[1] ?? m[2] ?? '';
    const id = /\br:id="([^"]+)"/.exec(attrs)?.[1] ?? /\br:id='([^']+)'/.exec(attrs)?.[1];
    if (id) {
      rid = id;
      break;
    }
  }
  if (!rid) throw new Error('xlsx_no_sheet');

  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!relsXml) throw new Error('xlsx_missing_rels');

  let target: string | null = null;
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const tgt = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id === rid && tgt) {
      target = tgt;
      break;
    }
  }
  if (!target) throw new Error('xlsx_sheet_target_missing');
  if (!target.startsWith('xl/')) target = `xl/${target.replace(/^\//, '')}`;

  const sheetXml = await zip.file(target)?.async('string');
  if (!sheetXml) throw new Error('xlsx_sheet_missing');

  const cells = new Map<string, string>();
  let maxRow = 0;
  for (const m of sheetXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
    const attrs = m[1] ?? m[3] ?? '';
    const inner = m[2] ?? '';
    const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
    if (!ref) continue;
    const cr = colRow(ref);
    if (!cr) continue;
    maxRow = Math.max(maxRow, cr.row);
    const cellXml = `<c ${attrs}>${inner}</c>`;
    cells.set(`${cr.row}:${cr.col}`, cellValue(cellXml, shared).trim());
  }

  const weeks: ServiceRotationWeek[] = [];
  for (let r = 4; r <= maxRow; r++) {
    const serialRaw = cells.get(`${r}:1`) ?? '';
    if (!serialRaw) continue;
    const serial = Number.parseFloat(serialRaw);
    if (!Number.isFinite(serial)) continue;
    const g = (c: number) => (cells.get(`${r}:${c}`) ?? '').trim();
    weeks.push({
      date: excelSerialToIsoDate(serial),
      chair: g(2),
      usher: g(3),
      scripture: g(4),
      communionOrTestimony: g(5),
      worship: g(7),
      sound: g(8),
      cleaning: g(12),
    });
  }

  const months = [...new Set(weeks.map((w) => Number.parseInt(w.date.slice(5, 7), 10)))]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const year = weeks[0]
    ? Number.parseInt(weeks[0].date.slice(0, 4), 10)
    : new Date().getFullYear();

  return {
    source: sourceName,
    quarter: {
      year,
      startMonth: months[0] ?? 1,
      endMonth: months[months.length - 1] ?? 12,
    },
    weeks,
  };
}

/** 2026 + startMonth 7 → 2026-q3 */
export function serviceRotationScheduleId(
  quarter: ServiceRotationSchedule['quarter'],
): string {
  const qn = Math.ceil(quarter.startMonth / 3);
  return `${quarter.year}-q${qn}`;
}

export function resolveServiceRotationTemplateDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '../templates/bulletin/service-rotation');
}

/** 写入季度 JSON + active.json */
export async function writeServiceRotationScheduleFiles(
  schedule: ServiceRotationSchedule,
  outDir?: string,
): Promise<{ id: string; path: string }> {
  const dir = outDir ?? resolveServiceRotationTemplateDir();
  const id = serviceRotationScheduleId(schedule.quarter);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.json`);
  writeFileSync(path, `${JSON.stringify(schedule, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(dir, 'active.json'),
    `${JSON.stringify({ id, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
  return { id, path };
}
