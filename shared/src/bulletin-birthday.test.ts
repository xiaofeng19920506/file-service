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

  it('estimates widths and shrinks font for long names', () => {
    expect(nameDisplayUnits('Aaron Wong')).toBeGreaterThan(nameDisplayUnits('Amy'));
    const long = 'Christopher Montgomery';
    expect(pickBirthdayFontSize([long, '甲'], 3)).toBeLessThan(4000);
  });

  it('rewrites slide24 name shape into a no-wrap table grid', async () => {
    const zip = await JSZip.loadAsync(readFileSync(templatePath));
    const xml = await zip.file('ppt/slides/slide24.xml')!.async('string');
    const out = applyBirthdayNameGridToSlideXml(
      xml,
      joinBirthdayNames(['Aaron Wong', '王伟', '李明', 'Amy Chen']),
    );
    expect(out).toContain('<a:tbl>');
    expect(out).toContain('wrap="none"');
    expect(out).toContain('Aaron');
    expect(out).toContain('\u00A0'); // NBSP between Aaron and Wong
    expect(out).toContain('cx="8546400"');
    expect(out).not.toContain('孫强');
    const runs = extractIndexedTextRuns(out);
    const texts = runs.map((r) => r.text.replace(/\u00A0/g, ' ').trim()).filter(Boolean);
    expect(texts).toEqual(expect.arrayContaining(['Aaron Wong', '王伟', '李明', 'Amy Chen']));
  });
});
