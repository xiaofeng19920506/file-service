import { describe, it, expect } from 'vitest';
import {
  canRemoveSlide,
  validateBatchRemove,
  applyBatchRemove,
  cloneSlides,
} from './slide-history.js';
import { slideIdentity, type EditableSlide } from './pptx-preview.js';

function slide(_id: string, sourceItemId: string, index: number): EditableSlide {
  return {
    index,
    slideInFile: index,
    slidePath: `ppt/slides/slide${index}.xml`,
    sourceFile: 'a.pptx',
    sourceItemId,
    title: `Slide ${index}`,
    snippet: '',
    textLines: [],
    imageUrls: [],
    imageMediaPaths: [],
    editable: true,
  };
}

describe('canRemoveSlide', () => {
  it('allows remove when multiple slides in file', () => {
    const slides = [slide('a1', 'file-a', 1), slide('a2', 'file-a', 2)];
    expect(canRemoveSlide(slides[0], slides)).toBe(true);
  });

  it('blocks removing last slide of only file', () => {
    const slides = [slide('a1', 'file-a', 1)];
    expect(canRemoveSlide(slides[0], slides)).toBe(false);
  });
});

describe('validateBatchRemove', () => {
  it('rejects empty selection', () => {
    expect(validateBatchRemove([slide('a1', 'f', 1)], new Set())).toBeTruthy();
  });

  it('rejects removing all slides from a file', () => {
    const slides = [slide('a1', 'f', 1), slide('a2', 'f', 2)];
    expect(
      validateBatchRemove(slides, new Set([slideIdentity(slides[0]), slideIdentity(slides[1])])),
    ).toContain('至少');
  });

  it('allows partial remove', () => {
    const slides = [slide('a1', 'f', 1), slide('a2', 'f', 2)];
    expect(validateBatchRemove(slides, new Set([slideIdentity(slides[0])]))).toBeNull();
  });
});

describe('applyBatchRemove', () => {
  it('reindexes remaining slides', () => {
    const slides = [slide('a1', 'f', 1), slide('a2', 'f', 2), slide('a3', 'f', 3)];
    const next = applyBatchRemove(slides, new Set([slideIdentity(slides[1])]));
    expect(next).toHaveLength(2);
    expect(next[0].index).toBe(1);
    expect(next[1].index).toBe(2);
  });
});

describe('cloneSlides', () => {
  it('deep clones arrays', () => {
    const slides = [slide('a1', 'f', 1)];
    slides[0].textLines.push('x');
    const copy = cloneSlides(slides);
    copy[0].textLines.push('y');
    expect(slides[0].textLines).toHaveLength(1);
  });
});
