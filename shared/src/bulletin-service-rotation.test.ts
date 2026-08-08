import { describe, expect, it } from 'vitest';
import {
  cleaningToRosterLines,
  loadBundledServiceRotationSchedules,
  normalizeWorshipLeaderName,
  resolveServiceRosterFromSchedule,
} from './bulletin-service-rotation.js';

describe('bulletin service rotation schedule', () => {
  it('loads 2026-q3 with 13 Sundays', () => {
    const schedules = loadBundledServiceRotationSchedules();
    expect(schedules.length).toBeGreaterThanOrEqual(1);
    const q3 = schedules.find((s) => s.quarter.year === 2026 && s.quarter.startMonth === 7);
    expect(q3?.weeks).toHaveLength(13);
    expect(q3?.weeks[0]?.date).toBe('2026-07-05');
    expect(q3?.weeks[12]?.date).toBe('2026-09-27');
  });

  it('normalizes worship names and cleaning lines', () => {
    expect(normalizeWorshipLeaderName('王燕群 姊妹')).toBe('王燕群');
    expect(normalizeWorshipLeaderName('潘奕丞 弟兄')).toBe('潘奕丞');
    expect(normalizeWorshipLeaderName('盧劉聆微 師母')).toBe('盧劉聆微');
    expect(cleaningToRosterLines('燕群, 曉峰, 孫強')).toBe('燕群\n曉峰\n孫強');
    expect(cleaningToRosterLines('林勝 美娟 一家; 海波一家')).toBe('林勝 美娟 一家\n海波一家');
  });

  it('maps 2026-07-12 today clean + next Sunday roster', () => {
    const fields = resolveServiceRosterFromSchedule('2026-07-12');
    expect(fields).not.toBeNull();
    expect(fields!.serviceRosterTodayDate).toBe('7/12');
    expect(fields!.serviceRosterText).toContain('振成');
    expect(fields!.serviceRosterText).toContain('Wilson');
    expect(fields!.serviceRosterNextDate).toBe('7/19');
    expect(fields!.serviceRosterChair).toBe('唐毅');
    expect(fields!.serviceRosterUsher).toBe('惠美');
    expect(fields!.serviceRosterWorship).toBe('潘奕丞');
    expect(fields!.serviceRosterCleanNames).toContain('林勝 美娟 一家');
    expect(fields!.rotationStartMonth).toBe('7');
    expect(fields!.rotationEndMonth).toBe('9');
  });

  it('clears next-Sunday fields on last week of schedule', () => {
    const fields = resolveServiceRosterFromSchedule('2026-09-27');
    expect(fields).not.toBeNull();
    expect(fields!.serviceRosterTodayDate).toBe('9/27');
    expect(fields!.serviceRosterText).toContain('美菊');
    expect(fields!.serviceRosterNextDate).toBe('');
    expect(fields!.serviceRosterChair).toBe('');
    expect(fields!.serviceRosterWorship).toBe('');
    expect(fields!.serviceRosterUsher).toBe('');
    expect(fields!.serviceRosterCleanNames).toBe('');
  });

  it('returns null for dates outside schedule', () => {
    expect(resolveServiceRosterFromSchedule('2026-06-28')).toBeNull();
    expect(resolveServiceRosterFromSchedule('')).toBeNull();
  });
});
