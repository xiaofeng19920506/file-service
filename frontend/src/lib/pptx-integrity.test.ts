import { describe, it, expect } from 'vitest';
import { xmlTagsBalanced } from './pptx-integrity.js';

describe('xmlTagsBalanced', () => {
  it('accepts a normal shape', () => {
    const xml =
      '<p:sld><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm>' +
      '<a:off x="0" y="0"/><a:ext cx="10" cy="10"/></a:xfrm></p:spPr>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/>' +
      '<a:t>你好</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
    expect(xmlTagsBalanced(xml)).toBe(true);
  });

  it('accepts prolog and self-closing tags', () => {
    expect(xmlTagsBalanced('<?xml version="1.0" encoding="UTF-8"?><a:p><a:br/></a:p>')).toBe(true);
  });

  it('rejects the <p:txBody> eaten by a bad text replace', () => {
    const xml = '<p:sp><p:txBody>主耶和華神在聖殿中</p:t></a:r></p:sp>';
    expect(xmlTagsBalanced(xml)).toBe(false);
  });

  it('rejects unclosed tags', () => {
    expect(xmlTagsBalanced('<p:sp><p:txBody></p:txBody>')).toBe(false);
  });
});
