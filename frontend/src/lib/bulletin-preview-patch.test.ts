import { describe, expect, it } from 'vitest';
import {
  bulletinPreviewCacheKey,
  previewPatchForSection,
} from './bulletin-preview-patch';

const full = {
  serviceDate: '2026-07-20',
  serviceTime: '11:00',
  scriptureBook: '诗篇 Psalms',
  scriptureReference: '1:1-6',
  showPreServiceChairName: true,
  preServiceChairNames: '王凯',
  hiddenSections: [] as string[],
  weeklyMeetingVariant: 28 as number | null,
};

describe('previewPatchForSection', () => {
  it('includes scripture + visibility structure + date for cover', () => {
    expect(previewPatchForSection('cover', full)).toEqual({
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
      hiddenSections: [],
      weeklyMeetingVariant: 28,
      serviceDate: '2026-07-20',
      serviceTime: '11:00',
    });
  });

  it('includes chair fields for pre_service', () => {
    expect(previewPatchForSection('pre_service', full)).toEqual({
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
      hiddenSections: [],
      weeklyMeetingVariant: 28,
      showPreServiceChairName: true,
      preServiceChairNames: '王凯',
    });
  });

  it('keeps worship key stable when only chair changes', () => {
    const a = bulletinPreviewCacheKey(10, previewPatchForSection('worship', full));
    const b = bulletinPreviewCacheKey(
      10,
      previewPatchForSection('worship', {
        ...full,
        preServiceChairNames: '别人',
        serviceDate: '2026-08-01',
      }),
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
});
