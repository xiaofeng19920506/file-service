import { describe, expect, it, beforeEach } from 'vitest';
import {
  mergeLocalDraftIntoBulletin,
  readLocalBulletinDraft,
  writeLocalBulletinDraft,
  type BulletinLocalDraft,
} from './bulletin-local-draft';
import type { WeeklyBulletin } from '../api/bulletins';

function baseBulletin(over: Partial<WeeklyBulletin> = {}): WeeklyBulletin {
  return {
    id: 'b1',
    serviceDate: '2026-08-02',
    serviceTime: '11:00',
    status: 'draft',
    lastWeekOfferingDate: '',
    offeringQuarterLabel: '',
    birthdayMonth: '',
    birthdayNames: '',
    showPreServiceChairName: false,
    preServiceChairNames: '',
    staffMeetingDate: '',
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
    outputBlobId: null,
    servicePlaylistId: null,
    worshipLyricsPptxBlobId: null,
    createdByUserId: 'u1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    announcements: [],
    ...over,
  };
}

describe('bulletin-local-draft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes and reads local draft', () => {
    writeLocalBulletinDraft('b1', {
      scriptureBook: '箴言 Proverbs',
      scriptureReference: '15:1-11',
    });
    const local = readLocalBulletinDraft('b1');
    expect(local?.fields.scriptureBook).toBe('箴言 Proverbs');
    expect(local?.dirty).toBe(true);
  });

  it('merges dirty local scripture over remote empty fields', () => {
    const remote = baseBulletin({ updatedAt: '2026-07-01T00:00:00.000Z' });
    const local: BulletinLocalDraft = {
      bulletinId: 'b1',
      savedAt: '2026-07-02T00:00:00.000Z',
      remoteUpdatedAt: remote.updatedAt,
      dirty: true,
      fields: {
        scriptureBook: '诗篇 Psalms',
        scriptureReference: '23:1-6',
      },
    };
    const merged = mergeLocalDraftIntoBulletin(remote, local);
    expect(merged.scriptureBook).toBe('诗篇 Psalms');
    expect(merged.scriptureReference).toBe('23:1-6');
  });
});
