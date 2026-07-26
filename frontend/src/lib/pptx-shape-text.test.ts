import { describe, expect, it } from 'vitest';
import { xmlTagsBalanced } from './pptx-integrity';
import { applyShapeTextToSlideXml } from './pptx-shape-text';

const SHAPE_WITH_FILL =
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr><p:spPr/>' +
  '<p:txBody><a:bodyPr/><a:lstStyle/>' +
  '<a:p><a:r><a:rPr lang="en" sz="4600"><a:solidFill><a:srgbClr val="800000"/></a:solidFill></a:rPr>' +
  '<a:t>原始</a:t></a:r></a:p></p:txBody></p:sp>';

describe('applyShapeTextToSlideXml', () => {
  it('keeps solidFill rPr well-formed when rewriting text + styles', () => {
    const out = applyShapeTextToSlideXml(SHAPE_WITH_FILL, 0, {
      text: '新正文',
      bold: true,
      fontSizePt: 28,
      fontFamily: 'Arial',
    });
    expect(xmlTagsBalanced(out)).toBe(true);
    expect(out).toContain('新正文');
    expect(out).toMatch(/<a:rPr[^>]*\sb="1"/);
    expect(out).toMatch(/sz="2800"/);
    expect(out).toContain('<a:solidFill>');
    expect(out).toContain('</a:rPr>');
    expect(out).not.toMatch(/<a:solidFill><a:srgbClr[^/]*\/>\s*<a:t>/);
  });

  it('keeps bodyPr with child elements well-formed', () => {
    const shape =
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/></p:nvSpPr><p:spPr/>' +
      '<p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr><a:lstStyle/>' +
      '<a:p><a:r><a:rPr sz="1800"/><a:t>hi</a:t></a:r></a:p></p:txBody></p:sp>';
    const out = applyShapeTextToSlideXml(shape, 0, { text: 'hello' });
    expect(xmlTagsBalanced(out)).toBe(true);
    expect(out).toContain('<a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr>');
    expect(out).toContain('hello');
  });
});
