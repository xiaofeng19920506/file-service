import { describe, expect, it } from 'vitest';
import type { WeeklyBulletin } from '../api/bulletins';
import {
  bulletinDynamicTextOverrides,
  bulletinDynamicTextOverridesKey,
} from './bulletin-pptx-patches';

function baseBulletin(overrides: Partial<WeeklyBulletin> = {}): WeeklyBulletin {
  return {
    id: 'b1',
    serviceDate: '2026-06-14',
    serviceTime: '11:00',
    status: 'draft',
    lastWeekOfferingDate: '',
    offeringQuarterLabel: '',
    offeringTitheAmount: '',
    offeringOtherAmount: '',
    offeringTotalAmount: '',
    birthdayMonth: '',
    birthdayNames: '',
    showPreServiceChairName: false,
    preServiceChairNames: '',
    staffMeetingDate: '',
    staffMeetingYear: '',
    staffMeetingMonth: '',
    staffMeetingStartTime: '',
    staffMeetingEndTime: '',
    testimonyShareDate: '',
    serviceRosterText: '',
    serviceRosterTodayDate: '',
    serviceRosterNextDate: '',
    serviceRosterChair: '',
    serviceRosterWorship: '',
    serviceRosterUsher: '',
    serviceRosterCleanNames: '',
    rotationStartMonth: '',
    rotationEndMonth: '',
    baptismText: '',
    scriptureBook: '',
    scriptureReference: '',
    verseOfWeek: '',
    weeklyMeetingVariant: null,
    weeklyMeetingTemplates: [],
    weeklyMeetingTemplateId: null,
    skipTestimonyWeek: false,
    skipDepartmentReports: false,
    hiddenSections: [],
    slideTextOverrides: [],
    sectionPptxOverrides: {},
    servicePlaylistId: null,
    worshipPresentationMode: 'youtube',
    worshipLyricsPptxBlobId: null,
    outputBlobId: null,
    createdByUserId: 'u1',
    createdAt: new Date().toISOString(),
    updatedAt: null,
    announcements: [],
    ...overrides,
  };
}

describe('bulletinDynamicTextOverridesKey', () => {
  it('changes when staff meeting / rotation / offering fields change', () => {
    const a = bulletinDynamicTextOverridesKey(baseBulletin());
    const staff = bulletinDynamicTextOverridesKey(
      baseBulletin({ staffMeetingYear: '2026', staffMeetingMonth: '7' }),
    );
    const rotation = bulletinDynamicTextOverridesKey(
      baseBulletin({ rotationStartMonth: '4', rotationEndMonth: '6' }),
    );
    const offering = bulletinDynamicTextOverridesKey(
      baseBulletin({ offeringTitheAmount: '100.00', offeringOtherAmount: '50.00' }),
    );
    expect(staff).not.toBe(a);
    expect(rotation).not.toBe(a);
    expect(offering).not.toBe(a);
    expect(bulletinDynamicTextOverrides(baseBulletin({ rotationStartMonth: '4', rotationEndMonth: '6' }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slide: 32, textIndex: 0 }),
      ]),
    );
  });
});
