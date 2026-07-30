import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  applyBirthdayNameGridToSlideXml,
  arrangeBirthdayNames,
  birthdayGridColumns,
  joinBirthdayNames,
  moveBirthdayName,
  nameDisplayUnits,
  parseBirthdayNames,
  pickBirthdayFontSize,
} from './bulletin-birthday.js';
import { extractIndexedTextRuns } from './bulletin-pptx-patch.js';

const templatePath = join(import.meta.dirname, '../templates/bulletin/06_14_2026.pptx');

describe('bulletin-birthday', () => {
  it('parses and joins name lists', () => {
    expect(parseBirthdayNames('甲\n乙,丙')).toEqual(['甲', '乙', '丙']);
    expect(joinBirthdayNames(['甲', '', '乙'])).toBe('甲\n乙');
  });

  it('picks grid columns by count and longest name', () => {
    expect(birthdayGridColumns(2)).toBe(1);
    expect(birthdayGridColumns(5)).toBe(2);
    expect(birthdayGridColumns(9)).toBe(3);
    // 极长英文名时减列，避免列内折行
    const long = 'Christopher Montgomery Wellington';
    expect(birthdayGridColumns(6, [long, '甲', '乙', '丙', '丁', '戊'])).toBeLessThanOrEqual(2);
  });

  it('arranges Chinese before English and moves rows', () => {
    expect(arrangeBirthdayNames(['Zoe', '王伟', 'Amy', '李明'])).toEqual([
      '李明',
      '王伟',
      'Amy',
      'Zoe',
    ]);
    expect(moveBirthdayName(['甲', '乙', '丙'], 2, 0)).toEqual(['丙', '甲', '乙']);
  });

  it('estimates CJK wider than latin and shrinks font for long names', () => {
    expect(nameDisplayUnits('王伟')).toBeGreaterThan(nameDisplayUnits('Amy'));
    const long = 'Christopher Montgomery';
    expect(pickBirthdayFontSize([long, '甲'], 3)).toBeLessThan(4400);
  });

  it('rewrites slide24 name shape into a wider no-wrap grid', async () => {
    const zip = await JSZip.loadAsync(readFileSync(templatePath));
    const xml = await zip.file('ppt/slides/slide24.xml')!.async('string');
    const out = applyBirthdayNameGridToSlideXml(
      xml,
      joinBirthdayNames(['甲', '乙', '丙', '丁', '戊', '己']),
    );
    expect(out).toContain('甲');
    expect(out).toContain('己');
    expect(out).toContain('cx="8546400"');
    expect(out).toContain('wrap="none"');
    expect(out).toContain('<a:tabLst>');
    expect(out).not.toContain('孫强');
    const runs = extractIndexedTextRuns(out);
    const texts = runs.map((r) => r.text.trim()).filter(Boolean);
    expect(texts).toEqual(expect.arrayContaining(['甲', '乙', '丙', '丁', '戊', '己']));
  });
});
