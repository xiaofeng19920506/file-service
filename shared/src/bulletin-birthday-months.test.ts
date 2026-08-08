import { describe, expect, it } from 'vitest';
import {
  BIRTHDAY_ANCHOR_SLIDE,
  birthdayMonthLibraryFileName,
  normalizeBirthdayMonth,
  parseBirthdayNamesByMonth,
  resolveBirthdayFields,
  serializeBirthdayNamesByMonth,
  slideNumberForBirthdayMonth,
} from './bulletin-birthday-months.js';
import { readBirthdayMonthLibraryPptx } from './bulletin-birthday-month-pptx.js';

describe('bulletin birthday months', () => {
  it('normalizes month numbers and legacy title text', () => {
    expect(normalizeBirthdayMonth('7')).toBe(7);
    expect(normalizeBirthdayMonth('07')).toBe(7);
    expect(normalizeBirthdayMonth('7月份生日的家人們')).toBe(7);
    expect(normalizeBirthdayMonth('3月')).toBe(3);
    expect(normalizeBirthdayMonth('', 11)).toBe(11);
  });

  it('uses single main-template anchor for all months', () => {
    expect(slideNumberForBirthdayMonth(1)).toBe(BIRTHDAY_ANCHOR_SLIDE);
    expect(slideNumberForBirthdayMonth(7)).toBe(24);
    expect(slideNumberForBirthdayMonth(12)).toBe(24);
    expect(birthdayMonthLibraryFileName(7)).toBe('month-07.pptx');
  });

  it('reads month library files from disk', () => {
    const july = readBirthdayMonthLibraryPptx(7);
    expect(july).not.toBeNull();
    expect(july!.byteLength).toBeGreaterThan(1000);
  });

  it('month library slides include names from Jan-Dec source', async () => {
    const JSZip = (await import('jszip')).default;
    const july = readBirthdayMonthLibraryPptx(7)!;
    const zip = await JSZip.loadAsync(july);
    const slidePath = Object.keys(zip.files).find((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slidePath).toBeTruthy();
    const xml = await zip.file(slidePath!)!.async('string');
    expect(xml).toContain('孫强');
    expect(xml).toContain('邱春林');
    expect(xml).toContain('Andrew Wang');

    const jan = readBirthdayMonthLibraryPptx(1)!;
    const janZip = await JSZip.loadAsync(jan);
    const janPath = Object.keys(janZip.files).find((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const janXml = await janZip.file(janPath!)!.async('string');
    expect(janXml).toContain('盧牧師');
    expect(janXml).toContain('張嘉文');
  });

  it('parses JSON by month and migrates flat legacy names', () => {
    expect(parseBirthdayNamesByMonth('{"7":"甲\\n乙"}')).toEqual({ '7': '甲\n乙' });
    const resolved = resolveBirthdayFields({
      birthdayMonth: '7月份生日的家人們',
      birthdayNames: '甲\n乙',
      serviceDate: '2026-08-02',
    });
    expect(resolved.month).toBe(7);
    expect(resolved.namesForMonth).toBe('甲\n乙');
    expect(serializeBirthdayNamesByMonth(resolved.namesByMonth)).toBe(
      JSON.stringify({ '7': '甲\n乙' }),
    );
  });

  it('keeps per-month lists when switching months', () => {
    const resolved = resolveBirthdayFields({
      birthdayMonth: '3',
      birthdayNames: JSON.stringify({ '3': '丙', '7': '甲\n乙' }),
      serviceDate: '2026-07-05',
    });
    expect(resolved.month).toBe(3);
    expect(resolved.namesForMonth).toBe('丙');
    expect(resolved.namesByMonth['7']).toBe('甲\n乙');
  });
});
