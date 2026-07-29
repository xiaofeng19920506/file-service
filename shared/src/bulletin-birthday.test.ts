import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  applyBirthdayNameGridToSlideXml,
  birthdayGridColumns,
  joinBirthdayNames,
  parseBirthdayNames,
} from './bulletin-birthday.js';
import { extractIndexedTextRuns } from './bulletin-pptx-patch.js';

const templatePath = join(import.meta.dirname, '../templates/bulletin/06_14_2026.pptx');

describe('bulletin-birthday', () => {
  it('parses and joins name lists', () => {
    expect(parseBirthdayNames('甲\n乙,丙')).toEqual(['甲', '乙', '丙']);
    expect(joinBirthdayNames(['甲', '', '乙'])).toBe('甲\n乙');
  });

  it('picks grid columns by count', () => {
    expect(birthdayGridColumns(2)).toBe(1);
    expect(birthdayGridColumns(5)).toBe(2);
    expect(birthdayGridColumns(9)).toBe(3);
  });

  it('rewrites slide24 name shape into a wider grid', async () => {
    const zip = await JSZip.loadAsync(readFileSync(templatePath));
    const xml = await zip.file('ppt/slides/slide24.xml')!.async('string');
    const out = applyBirthdayNameGridToSlideXml(
      xml,
      joinBirthdayNames(['甲', '乙', '丙', '丁', '戊', '己']),
    );
    expect(out).toContain('甲');
    expect(out).toContain('己');
    expect(out).toContain('cx="8546400"');
    expect(out).not.toContain('孫强');
    const runs = extractIndexedTextRuns(out);
    const texts = runs.map((r) => r.text.trim()).filter(Boolean);
    expect(texts).toEqual(expect.arrayContaining(['甲', '乙', '丙', '丁', '戊', '己']));
  });
});
