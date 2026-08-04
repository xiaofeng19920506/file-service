import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BIRTHDAY_ANCHOR_SLIDE,
  birthdayMonthLibraryFileName,
  resolveBirthdayFields,
  type BirthdayMonth,
} from './bulletin-birthday-months.js';
import { spliceSectionSlidesIntoPptx } from './pptx-splice-section.js';

type PptxBytes = Buffer | Uint8Array | ArrayBuffer;

function resolveBirthdayLibraryDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../templates/bulletin/birthday'),
    join(process.cwd(), 'shared/templates/bulletin/birthday'),
    join(process.cwd(), '../shared/templates/bulletin/birthday'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, birthdayMonthLibraryFileName(1)))) return dir;
  }
  return candidates[0]!;
}

const LIBRARY_DIR = resolveBirthdayLibraryDir();

/** 读取模板库中某月的单页 PPTX（无则 null） */
export function readBirthdayMonthLibraryPptx(month: BirthdayMonth): Buffer | null {
  const path = join(LIBRARY_DIR, birthdayMonthLibraryFileName(month));
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

/** 把当月库页（或已加载的 mini）splice 到主模板生日锚点 */
export async function spliceBirthdayMonthSlideIntoPptx(
  basePptx: PptxBytes,
  monthMiniPptx: PptxBytes,
): Promise<Uint8Array> {
  return spliceSectionSlidesIntoPptx(basePptx, monthMiniPptx, [BIRTHDAY_ANCHOR_SLIDE]);
}

/** 从磁盘月库取出当月页，覆写主模板生日锚点 */
export async function applyBirthdayMonthFromLibraryToPptx(
  basePptx: PptxBytes,
  input: {
    birthdayMonth?: string | number | null;
    serviceDate?: string | null;
  },
): Promise<Uint8Array> {
  const { month } = resolveBirthdayFields({
    birthdayMonth:
      input.birthdayMonth === null || input.birthdayMonth === undefined
        ? ''
        : String(input.birthdayMonth),
    serviceDate: input.serviceDate,
  });
  const mini = readBirthdayMonthLibraryPptx(month);
  if (!mini) {
    if (basePptx instanceof Uint8Array) return basePptx;
    if (basePptx instanceof ArrayBuffer) return new Uint8Array(basePptx);
    return new Uint8Array(basePptx);
  }
  return spliceBirthdayMonthSlideIntoPptx(basePptx, mini);
}
