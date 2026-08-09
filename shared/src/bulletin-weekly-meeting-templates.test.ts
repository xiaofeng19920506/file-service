import { describe, expect, it } from 'vitest';
import {
  normalizeWeeklyMeetingTemplateId,
  normalizeWeeklyMeetingTemplates,
  parseWeeklyMeetingSelectValue,
  weeklyMeetingSelectValue,
} from './bulletin-weekly-meeting-templates.js';

describe('weekly meeting templates', () => {
  it('normalizes template list and drops bad rows', () => {
    expect(
      normalizeWeeklyMeetingTemplates([
        {
          id: 'a1',
          label: '  青年聚会  ',
          blobId: '11111111-1111-4111-8111-111111111111',
        },
        { id: 'a1', label: 'dup', blobId: '11111111-1111-4111-8111-111111111111' },
        { id: 'bad', label: 'x', blobId: 'not-uuid' },
      ]),
    ).toEqual([
      {
        id: 'a1',
        label: '青年聚会',
        blobId: '11111111-1111-4111-8111-111111111111',
      },
    ]);
  });

  it('select value prefers custom id over variant', () => {
    expect(
      weeklyMeetingSelectValue({
        weeklyMeetingVariant: 29,
        weeklyMeetingTemplateId: 'c1',
      }),
    ).toBe('t:c1');
    expect(weeklyMeetingSelectValue({ weeklyMeetingVariant: null })).toBe('28');
  });

  it('parses select values', () => {
    expect(parseWeeklyMeetingSelectValue('29')).toEqual({ kind: 'builtin', variant: 29 });
    expect(parseWeeklyMeetingSelectValue('t:abc')).toEqual({
      kind: 'custom',
      templateId: 'abc',
    });
    expect(parseWeeklyMeetingSelectValue('')).toEqual({ kind: 'builtin', variant: 28 });
  });

  it('clears template id when not in list', () => {
    expect(normalizeWeeklyMeetingTemplateId('missing', [])).toBeNull();
    expect(
      normalizeWeeklyMeetingTemplateId('a1', [
        { id: 'a1', label: 'x', blobId: '11111111-1111-4111-8111-111111111111' },
      ]),
    ).toBe('a1');
  });
});
