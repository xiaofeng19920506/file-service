import { describe, expect, it, beforeEach, vi } from 'vitest';
import { detectBusySection, fingerprintOf } from '../hooks/useBulletinLocalDraftSync';
import {
  writeLocalBulletinDraft,
} from './bulletin-local-draft';
import type { WeeklyBulletin } from '../api/bulletins';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

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

describe('detectBusySection', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('attributes birthday field changes to birthday section', () => {
    const prev = baseBulletin();
    const next = baseBulletin({ birthdayNames: '甲' });
    expect(detectBusySection(fingerprintOf(prev), next)).toBe('birthday');
  });

  it('does not fall back to scripture for sectionPptxOverrides-only changes', () => {
    const prev = baseBulletin();
    const next = baseBulletin({
      sectionPptxOverrides: { worship: 'blob-1' },
    });
    expect(detectBusySection(fingerprintOf(prev), next)).toBeNull();
  });

  it('uses local dirty fields when prev fingerprint is null', () => {
    writeLocalBulletinDraft('b1', {
      birthdayNames: '乙',
    });
    const next = baseBulletin({ birthdayNames: '乙' });
    expect(detectBusySection(null, next)).toBe('birthday');
  });
});

describe('fingerprint stability', () => {
  it('changes when serviceDate changes', () => {
    const a = fingerprintOf(baseBulletin({ serviceDate: '2026-08-02' }));
    const b = fingerprintOf(baseBulletin({ serviceDate: '2026-08-09' }));
    expect(a).not.toBe(b);
  });
});
