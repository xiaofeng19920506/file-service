import { describe, expect, it } from 'vitest';
import {
  findMetadataConflicts,
  mergeMetadataFillEmpty,
  normalizeMetadataInput,
} from './blob-metadata.js';

describe('blob metadata', () => {
  it('maps legacy title to simplified Chinese', () => {
    expect(normalizeMetadataInput({ title: '有能力' })).toMatchObject({
      titleZhCn: '有能力',
      titleEn: null,
      titleZhTw: null,
    });
  });

  it('detects conflicts across bilingual title fields', () => {
    const existing = normalizeMetadataInput({
      titleEn: 'Mighty',
      titleZhCn: '有能力',
      titleZhTw: '有能力',
    });
    const conflicts = findMetadataConflicts(existing, {
      titleZhTw: '有大能',
    });
    expect(conflicts).toEqual([
      { field: 'titleZhTw', existing: '有能力', incoming: '有大能' },
    ]);
  });

  it('fills only empty title fields', () => {
    const existing = normalizeMetadataInput({
      titleEn: 'Mighty',
      titleZhCn: '有能力',
    });
    const { patch, filled } = mergeMetadataFillEmpty(existing, {
      titleEn: 'Other',
      titleZhTw: '有大能',
      composer: 'Smith',
    });
    expect(patch).toEqual({ titleZhTw: '有大能', composer: 'Smith' });
    expect(filled).toEqual(['titleZhTw', 'composer']);
  });
});
