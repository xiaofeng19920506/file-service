import { describe, expect, it } from 'vitest';
import {
  formatBulletinCoverDate,
  nextSundayIso,
  resolveAvailableSundayIso,
  sundayAfterIso,
  toLocalIsoDate,
  upcomingSundayIso,
} from './bulletin-date';

describe('bulletin-date', () => {
  it('formats cover date as MM/DD/YYYY', () => {
    expect(formatBulletinCoverDate('2026-07-26')).toBe('07/26/2026');
  });

  it('upcomingSundayIso keeps Sunday as today', () => {
    // 2026-07-26 is Sunday
    expect(upcomingSundayIso(new Date(2026, 6, 26))).toBe('2026-07-26');
  });

  it('upcomingSundayIso advances weekdays to that week’s Sunday', () => {
    // 2026-07-27 is Monday → 2026-08-02
    expect(upcomingSundayIso(new Date(2026, 6, 27))).toBe('2026-08-02');
    // 2026-08-01 is Saturday → 2026-08-02
    expect(upcomingSundayIso(new Date(2026, 7, 1))).toBe('2026-08-02');
  });

  it('nextSundayIso skips today when it is already Sunday', () => {
    expect(nextSundayIso(new Date(2026, 6, 26))).toBe('2026-08-02');
  });

  it('sundayAfterIso adds seven days', () => {
    expect(sundayAfterIso('2026-08-02')).toBe('2026-08-09');
  });

  it('resolveAvailableSundayIso skips occupied Sundays', () => {
    const from = new Date(2026, 6, 27); // Monday → upcoming 2026-08-02
    expect(resolveAvailableSundayIso(['2026-08-02', '2026-08-09'], from)).toBe('2026-08-16');
  });

  it('toLocalIsoDate uses local calendar components', () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
