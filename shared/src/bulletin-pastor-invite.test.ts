import { describe, expect, it } from 'vitest';
import {
  isMondayPastorInviteWindow,
  isValidPastorEmail,
  upcomingSundayIsoInTimeZone,
  zonedWeekdayAndHour,
} from './bulletin-pastor-invite.js';

describe('bulletin pastor invite schedule helpers', () => {
  it('validates email', () => {
    expect(isValidPastorEmail('a@b.co')).toBe(true);
    expect(isValidPastorEmail('bad')).toBe(false);
  });

  it('upcoming Sunday from a Monday in New York', () => {
    // 2026-08-10 15:00 UTC = Monday morning EDT
    const monday = new Date('2026-08-10T15:00:00.000Z');
    expect(upcomingSundayIsoInTimeZone(monday, 'America/New_York')).toBe('2026-08-16');
    const parts = zonedWeekdayAndHour(monday, 'America/New_York');
    expect(parts.weekday).toBe(1);
    expect(isMondayPastorInviteWindow(monday, { timeZone: 'America/New_York', hour: 9 })).toBe(
      true,
    );
  });

  it('not in window on Tuesday', () => {
    const tue = new Date('2026-08-11T15:00:00.000Z');
    expect(isMondayPastorInviteWindow(tue, { timeZone: 'America/New_York', hour: 9 })).toBe(false);
  });
});
