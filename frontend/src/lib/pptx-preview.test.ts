import { describe, it, expect } from 'vitest';
import {
  applyTextsToSlideXml,
  clearSlideTexts,
  extractTexts,
  slidesContentEqual,
  type EditableSlide,
} from './pptx-preview.js';

const SHAPE_XML =
  '<p:sp><p:nvSpPr><p:cNvPr id="264" name="Shape 264"/></p:nvSpPr>' +
  '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>' +
  '<p:txBody><a:bodyPr/><a:lstStyle/>' +
  '<a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1" sz="4600"/><a:t>主耶和華神在聖殿中</a:t></a:r></a:p>' +
  '<a:p><a:r><a:rPr sz="2400"/><a:t>當存敬畏</a:t></a:r></a:p>' +
  '</p:txBody></p:sp>';

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

describe('slide text rewriting keeps XML structure', () => {
  it('does not treat <p:txBody> as a text node', () => {
    const out = applyTextsToSlideXml(SHAPE_XML, '新標題', '新正文');
    expect(out).toContain('<p:txBody><a:bodyPr/><a:lstStyle/>');
    expect(out).toContain('<a:t>新標題</a:t>');
    expect(out).toContain('<a:t>新正文</a:t>');
    expect(out).not.toContain('</p:t>');
    expect(out.match(/<a:rPr b="1" sz="4600"\/>/)).not.toBeNull();
  });

  it('clears text without eating the txBody wrapper', () => {
    const out = clearSlideTexts(SHAPE_XML);
    expect(out).toContain('<p:txBody><a:bodyPr/><a:lstStyle/>');
    expect(out).toContain('<a:t></a:t>');
    expect(out).not.toContain('</p:t>');
    expect(extractTexts(out)).toEqual([]);
  });

  it('leaves tags that merely start with the same prefix alone', () => {
    const xml = '<a:ln><a:tailEnd type="none"/></a:ln><a:t>keep</a:t>';
    expect(clearSlideTexts(xml)).toBe('<a:ln><a:tailEnd type="none"/></a:ln><a:t></a:t>');
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
    backgroundKind: 'none',
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
