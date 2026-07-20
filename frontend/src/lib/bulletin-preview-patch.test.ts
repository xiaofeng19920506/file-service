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
};

describe('previewPatchForSection', () => {
  it('includes scripture + date/time for cover', () => {
    expect(previewPatchForSection('cover', full)).toEqual({
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
      serviceDate: '2026-07-20',
      serviceTime: '11:00',
    });
  });

  it('includes scripture + chair fields for pre_service', () => {
    expect(previewPatchForSection('pre_service', full)).toEqual({
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
      showPreServiceChairName: true,
      preServiceChairNames: '王凯',
    });
  });

  it('only includes scripture for other sections (structure must match)', () => {
    expect(previewPatchForSection('scripture', full)).toEqual({
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
    });
    expect(previewPatchForSection('worship', full)).toEqual({
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
    });
    expect(previewPatchForSection('benediction', full)).toEqual({
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '1:1-6',
    });
  });

  it('keeps worship cache key stable when only chair/cover change', () => {
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

  it('changes all keys when scripture changes (page structure)', () => {
    const a = bulletinPreviewCacheKey(10, previewPatchForSection('worship', full));
    const b = bulletinPreviewCacheKey(
      10,
      previewPatchForSection('worship', {
        ...full,
        scriptureReference: '119:1-40',
      }),
    );
    expect(a).not.toBe(b);
  });

  it('changes pre_service cache key when chair name changes', () => {
    const a = bulletinPreviewCacheKey(2, previewPatchForSection('pre_service', full));
    const b = bulletinPreviewCacheKey(
      2,
      previewPatchForSection('pre_service', { ...full, preServiceChairNames: '别人' }),
    );
    expect(a).not.toBe(b);
  });
});
