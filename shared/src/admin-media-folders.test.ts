import { describe, expect, it } from 'vitest';
import { seriesFolderFromTitle } from './admin-media-folders.js';

describe('seriesFolderFromTitle', () => {
  it('uses explicit series name', () => {
    expect(seriesFolderFromTitle('甜宠短剧', '忽略标题 第1集', 'id')).toBe('甜宠短剧');
  });

  it('strips episode markers from youtube title', () => {
    expect(seriesFolderFromTitle(undefined, '山河令 第12集 高清', 'id')).toBe('山河令');
  });
});
