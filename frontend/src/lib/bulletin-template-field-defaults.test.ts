import { describe, expect, it } from 'vitest';
import type { WeeklyBulletin } from '../api/bulletins';
import {
  BULLETIN_TEMPLATE_FIELD_DEFAULTS,
  withTemplateFieldDefaults,
} from './bulletin-template-field-defaults';

function baseBulletin(over: Partial<WeeklyBulletin> = {}): WeeklyBulletin {
  return {
    id: 'b1',
    serviceDate: '2026-08-02',
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
    baptismText: '',
    scriptureBook: '',
    scriptureReference: '',
    verseOfWeek: '',
    weeklyMeetingVariant: null,
    skipTestimonyWeek: false,
    skipDepartmentReports: false,
    hiddenSections: [],
    slideTextOverrides: [],
    sectionPptxOverrides: {},
    worshipLyricsPptxBlobId: null,
    servicePlaylistId: null,
    outputBlobId: null,
    announcements: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

describe('withTemplateFieldDefaults offeringTotalAmount', () => {
  it('preserves an existing total instead of recomputing over it', () => {
    const out = withTemplateFieldDefaults(
      baseBulletin({
        offeringTitheAmount: '100.00',
        offeringOtherAmount: '50.00',
        offeringTotalAmount: '999.00',
      }),
    );
    expect(out.offeringTotalAmount).toBe('999.00');
  });

  it('computes total when empty using tithe + other (or template defaults)', () => {
    const fromAmounts = withTemplateFieldDefaults(
      baseBulletin({
        offeringTitheAmount: '100.00',
        offeringOtherAmount: '50.00',
        offeringTotalAmount: '',
      }),
    );
    expect(fromAmounts.offeringTotalAmount).toBe('150.00');

    const fromTemplate = withTemplateFieldDefaults(baseBulletin());
    expect(fromTemplate.offeringTitheAmount).toBe(
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.offeringTitheAmount,
    );
    expect(fromTemplate.offeringOtherAmount).toBe(
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.offeringOtherAmount,
    );
    expect(fromTemplate.offeringTotalAmount).toBe(
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.offeringTotalAmount,
    );
  });
});
