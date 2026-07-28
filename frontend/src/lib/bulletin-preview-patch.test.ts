import { describe, expect, it } from 'vitest';
import {
  bulletinPreviewCacheKey,
  previewPatchForSection,
  previewPatchFull,
} from './bulletin-preview-patch';

const full = {
  serviceDate: '2026-07-20',
  serviceTime: '11:00',
  scriptureBook: '诗篇 Psalms',
  scriptureReference: '1:1-6',
  showPreServiceChairName: true,
  preServiceChairNames: '王凯',
  birthdayMonth: '七月',
  birthdayNames: '甲,乙',
  verseOfWeek: '金句',
  hiddenSections: [] as string[],
  weeklyMeetingVariant: 28 as number | null,
};

describe('previewPatchFull / previewPatchForSection', () => {
  it('returns the same full patch for every section (no per-section trimming)', () => {
    const expected = {
      serviceDate: '2026-07-20',
      serviceTime: '11:00',
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
      showPreServiceChairName: true,
      preServiceChairNames: '王凯',
      birthdayMonth: '七月',
      birthdayNames: '甲,乙',
      verseOfWeek: '金句',
      announcements: undefined,
      hiddenSections: [],
      weeklyMeetingVariant: 28,
      slideTextOverrides: undefined,
      bulletinId: undefined,
      sectionPptxKey: undefined,
    };
    expect(previewPatchFull(full)).toEqual(expected);
    expect(previewPatchForSection('cover', full)).toEqual(expected);
    expect(previewPatchForSection('pre_service', full)).toEqual(expected);
    expect(previewPatchForSection('worship', full)).toEqual(expected);
    expect(previewPatchForSection('offering', full)).toEqual(expected);
  });

  it('changes keys when chair or date changes (full patch is shared)', () => {
    const a = bulletinPreviewCacheKey(2, previewPatchForSection('pre_service', full), 'pre_service');
    const b = bulletinPreviewCacheKey(
      2,
      previewPatchForSection('pre_service', {
        ...full,
        preServiceChairNames: '别人',
      }),
      'pre_service',
    );
    expect(a).not.toBe(b);

    const c = bulletinPreviewCacheKey(10, previewPatchForSection('worship', full), 'worship');
    const d = bulletinPreviewCacheKey(
      10,
      previewPatchForSection('worship', {
        ...full,
        serviceDate: '2026-08-01',
      }),
      'worship',
    );
    // 崇拜区不依赖封面日期：分区感知后应保持同一 contentRev
    expect(c).toBe(d);
  });

  it('birthday change does not invalidate worship cache key', () => {
    const a = bulletinPreviewCacheKey(10, previewPatchFull(full), 'worship');
    const b = bulletinPreviewCacheKey(
      10,
      previewPatchFull({ ...full, birthdayNames: '丙,丁' }),
      'worship',
    );
    expect(a).toBe(b);
  });

  it('changes keys when hidden sections change', () => {
    const a = bulletinPreviewCacheKey(10, previewPatchForSection('worship', full));
    const b = bulletinPreviewCacheKey(
      10,
      previewPatchForSection('worship', {
        ...full,
        hiddenSections: ['communion'],
      }),
    );
    expect(a).not.toBe(b);
  });

  it('changes keys when section pptx overrides fingerprint changes', () => {
    const a = bulletinPreviewCacheKey(
      10,
      previewPatchForSection('worship', {
        ...full,
        bulletinId: 'b1',
        sectionPptxKey: 'worship:blob-a',
      }),
    );
    const b = bulletinPreviewCacheKey(
      10,
      previewPatchForSection('worship', {
        ...full,
        bulletinId: 'b1',
        sectionPptxKey: 'worship:blob-b',
      }),
    );
    expect(a).not.toBe(b);
  });
});
