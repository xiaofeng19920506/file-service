import { describe, it, expect } from 'vitest';
import {
  extractTexts,
  slidesContentEqual,
  type EditableSlide,
} from './pptx-preview.js';

describe('extractTexts', () => {
  it('extracts text from slide XML', () => {
    const xml = `
      <p:sld>
        <a:t>Hello</a:t>
        <a:t>World</a:t>
      </p:sld>`;
    expect(extractTexts(xml)).toEqual(['Hello', 'World']);
  });

  it('ignores empty runs', () => {
    const xml = '<a:t>   </a:t><a:t>Only</a:t>';
    expect(extractTexts(xml)).toEqual(['Only']);
  });
});

describe('slidesContentEqual', () => {
  const base: EditableSlide = {
    index: 0,
    slideInFile: 0,
    slidePath: 'ppt/slides/slide1.xml',
    sourceFile: 'demo.pptx',
    title: 'Title',
    snippet: 'Body',
    textLines: ['Body'],
    imageUrls: [],
    imageMediaPaths: [],
    editable: true,
    blank: false,
    isNew: false,
  };

  it('detects title changes', () => {
    const changed = { ...base, title: 'Other' };
    expect(slidesContentEqual([base], [changed])).toBe(false);
  });

  it('matches identical slides', () => {
    expect(slidesContentEqual([base], [{ ...base }])).toBe(true);
  });
});
