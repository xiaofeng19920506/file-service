import { describe, expect, it } from 'vitest';
import {
  applyServiceRosterFromSchedule,
  resolveServiceRosterFromSchedule,
} from './bulletin-service-rotation';

describe('frontend bulletin service rotation', () => {
  it('resolves 2026-07-12 from bundled JSON', () => {
    const fields = resolveServiceRosterFromSchedule('2026-07-12');
    expect(fields?.serviceRosterChair).toBe('唐毅');
    expect(fields?.serviceRosterWorship).toBe('潘奕丞');
    expect(fields?.rotationStartMonth).toBe('7');
  });

  it('applyServiceRosterFromSchedule overlays roster fields', () => {
    const next = applyServiceRosterFromSchedule({
      serviceDate: '2026-08-02',
      serviceRosterChair: '旧值',
      verseOfWeek: 'keep',
    });
    expect(next.verseOfWeek).toBe('keep');
    expect(next.serviceRosterTodayDate).toBe('8/2');
    expect(next.serviceRosterNextDate).toBe('8/9');
    expect(next.serviceRosterChair).toBe('王凱');
    expect(next.serviceRosterWorship).toBe('鄂悦心');
  });
});
