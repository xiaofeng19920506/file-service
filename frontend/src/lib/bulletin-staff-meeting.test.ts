import { describe, expect, it } from 'vitest';
import { buildStaffMeetingReplacements } from './bulletin-pptx-patches';

describe('buildStaffMeetingReplacements', () => {
  it('builds title, date fragment cleanup, and time range', () => {
    expect(
      buildStaffMeetingReplacements({
        staffMeetingYear: '2026',
        staffMeetingMonth: '7',
        staffMeetingDate: '下主日(7/12/2026)',
        staffMeetingStartTime: '12:45 pm',
        staffMeetingEndTime: '2:00 pm',
      }),
    ).toEqual([
      { textIndex: 0, text: '2026年7' },
      { textIndex: 3, text: '下主日(7/12/2026)' },
      { textIndex: 4, text: '' },
      { textIndex: 5, text: '' },
      { textIndex: 6, text: '於' },
      { textIndex: 9, text: '12:45 pm- 2:00 pm ' },
    ]);
  });

  it('skips incomplete title or empty fields', () => {
    expect(buildStaffMeetingReplacements({ staffMeetingYear: '2026' })).toEqual([]);
    expect(
      buildStaffMeetingReplacements({
        staffMeetingStartTime: '1:00 pm',
      }),
    ).toEqual([{ textIndex: 9, text: '1:00 pm ' }]);
  });
});
