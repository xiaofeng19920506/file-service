import { describe, expect, it } from 'vitest';
import { buildServiceRosterReplacements, joinRosterNamesForSlide } from './bulletin-roster';
import { formatBulletinShortDate } from './bulletin-date';

describe('formatBulletinShortDate', () => {
  it('strips leading zeros', () => {
    expect(formatBulletinShortDate('2026-06-14')).toBe('6/14');
    expect(formatBulletinShortDate('2026-12-07')).toBe('12/7');
  });
});

describe('buildServiceRosterReplacements', () => {
  it('writes today, next Sunday, roles, and cleaning lists', () => {
    expect(
      buildServiceRosterReplacements({
        serviceRosterTodayDate: '6/14',
        serviceRosterText: 'Michelle\n洪雪吟\n嘉文',
        serviceRosterNextDate: '6/21',
        serviceRosterChair: '賴建平',
        serviceRosterWorship: '李麗婷',
        serviceRosterUsher: '惠美',
        serviceRosterCleanNames: '惠美\n悅心\nHelen',
      }),
    ).toEqual([
      { textIndex: 18, text: '今日(6/14)清潔輪值' },
      { textIndex: 1, text: 'Michelle, 洪雪吟, 嘉文' },
      { textIndex: 0, text: '下主日(6/21)服事輪值' },
      { textIndex: 4, text: '賴建平 ' },
      { textIndex: 8, text: '李麗婷 ' },
      { textIndex: 12, text: '惠美 ' },
      { textIndex: 15, text: '惠美, 悅心, Helen' },
    ]);
  });

  it('joins names for slide with commas', () => {
    expect(joinRosterNamesForSlide('A\nB, C')).toBe('A, B, C');
  });
});
