import { describe, expect, it } from 'vitest';
import { xmlTagsBalanced } from './pptx-integrity.js';

describe('xmlTagsBalanced', () => {
  it('accepts well-formed slide fragments', () => {
    const xml =
      '<p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr/><a:t>hi</a:t></a:r></a:p></p:txBody></p:sp>';
    expect(xmlTagsBalanced(xml)).toBe(true);
  });

  it('rejects missing bodyPr close (historical text rewrite bug)', () => {
    const xml =
      '<p:txBody><a:bodyPr wrap="square"><a:noAutofit/><a:lstStyle/><a:p><a:r><a:t>x</a:t></a:r></a:p></p:txBody>';
    expect(xmlTagsBalanced(xml)).toBe(false);
  });

  it('rejects solidFill that swallowed <a:t>', () => {
    const xml =
      '<a:r><a:rPr><a:solidFill><a:srgbClr val="800000"/><a:t>主席會前禱告</a:t></a:r>';
    expect(xmlTagsBalanced(xml)).toBe(false);
  });
});
