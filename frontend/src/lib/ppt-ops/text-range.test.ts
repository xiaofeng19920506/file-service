import { describe, expect, it } from 'vitest';
import { applyRunPatchToCharRange } from './text';
import { rewriteShapeTextPreservingRuns, applyShapeTextToSlideXml } from '../pptx-shape-text';
import { xmlTagsBalanced } from '../pptx-integrity';

const MULTI_COLOR_SHAPE =
  '<p:sp><p:nvSpPr><p:cNvPr id="10" name="Title"/></p:nvSpPr><p:spPr/>' +
  '<p:txBody><a:bodyPr/><a:lstStyle/>' +
  '<a:p><a:pPr algn="ctr"/>' +
  '<a:r><a:rPr b="1" sz="4600"><a:solidFill><a:srgbClr val="800000"/></a:solidFill></a:rPr>' +
  '<a:t>主耶和華</a:t></a:r>' +
  '<a:endParaRPr/></a:p>' +
  '<a:p><a:pPr algn="ctr"/>' +
  '<a:r><a:rPr b="1" sz="4100"><a:solidFill><a:srgbClr val="3333CC"/></a:solidFill></a:rPr>' +
  '<a:t>保持安靜</a:t></a:r>' +
  '<a:r><a:rPr b="1" sz="3300"><a:solidFill><a:srgbClr val="3333CC"/></a:solidFill></a:rPr>' +
  '<a:t>並</a:t></a:r>' +
  '<a:r><a:rPr b="1" sz="4100"><a:solidFill><a:srgbClr val="3333CC"/></a:solidFill></a:rPr>' +
  '<a:t>認罪禱告</a:t></a:r>' +
  '<a:endParaRPr/></a:p>' +
  '</p:txBody></p:sp>';

describe('rewriteShapeTextPreservingRuns', () => {
  it('does not rewrite when text is unchanged', () => {
    const text = '主耶和華\n保持安靜並認罪禱告';
    const out = rewriteShapeTextPreservingRuns(MULTI_COLOR_SHAPE, text);
    expect(out).toBe(MULTI_COLOR_SHAPE);
  });

  it('keeps both red and blue fills after a text-only rewrite', () => {
    const out = rewriteShapeTextPreservingRuns(MULTI_COLOR_SHAPE, '主耶和華神\n保持安靜並認罪禱告');
    expect(xmlTagsBalanced(out)).toBe(true);
    expect(out).toContain('val="800000"');
    expect(out).toContain('val="3333CC"');
    expect(out).toContain('主耶和華神');
  });

  it('applyShapeTextToSlideXml text-only path preserves colors', () => {
    const slide = `<p:sld>${MULTI_COLOR_SHAPE}</p:sld>`;
    const out = applyShapeTextToSlideXml(slide, 0, { text: '主耶和華\n保持安靜並認罪禱告' });
    expect(out).toContain('val="800000"');
    expect(out).toContain('val="3333CC"');
  });
});

describe('paragraphsPreservingRunStyles', () => {
  it('keeps red and blue colors when typing into a multi-color box', async () => {
    const { paragraphsPreservingRunStyles } = await import('../pptx-shape-text');
    const template = [
      {
        runs: [{ text: '主耶和華', color: '#800000', bold: true, fontSizePt: 46 }],
        align: 'center' as const,
        lineSpacing: 1,
      },
      {
        runs: [
          { text: '保持安靜', color: '#3333CC', bold: true, fontSizePt: 41 },
          { text: '並', color: '#3333CC', bold: true, fontSizePt: 33 },
          { text: '認罪禱告', color: '#3333CC', bold: true, fontSizePt: 41 },
        ],
        align: 'center' as const,
        lineSpacing: 1,
      },
    ];
    const out = paragraphsPreservingRunStyles(template, '主耶和華神\n保持安靜並認罪禱告啊');
    expect(out[0]!.runs.some((r) => r.color === '#800000')).toBe(true);
    expect(out[1]!.runs.every((r) => r.color === '#3333CC')).toBe(true);
    expect(out.map((p) => p.runs.map((r) => r.text).join('')).join('\n')).toBe(
      '主耶和華神\n保持安靜並認罪禱告啊',
    );
  });
});

describe('applyRunPatchToCharRange', () => {
  it('recolors only the highlighted substring', () => {
    const slide =
      '<p:sld><p:spTree>' +
      '<p:sp><p:nvSpPr><p:cNvPr id="10" name="T"/></p:nvSpPr><p:spPr/>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/>' +
      '<a:p><a:r><a:rPr sz="2000"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr>' +
      '<a:t>ABCDEF</a:t></a:r></a:p>' +
      '</p:txBody></p:sp>' +
      '</p:spTree></p:sld>';

    // highlight "CD" (indices 2..4)
    const out = applyRunPatchToCharRange(slide, 10, 2, 4, { color: '#FF0000' });
    expect(xmlTagsBalanced(out)).toBe(true);
    expect(out).toMatch(/<a:t[^>]*>AB<\/a:t>/);
    expect(out).toMatch(/val="FF0000"/);
    expect(out).toMatch(/<a:t[^>]*>CD<\/a:t>/);
    expect(out).toMatch(/<a:t[^>]*>EF<\/a:t>/);
    // untouched parts keep black
    const blacks = out.match(/val="000000"/g) ?? [];
    expect(blacks.length).toBeGreaterThanOrEqual(1);
  });

  it('can change font size on a range spanning multiple runs', () => {
    const slide = `<p:sld><p:spTree>${MULTI_COLOR_SHAPE}</p:spTree></p:sld>`;
    // MULTI_COLOR has no spacer; "保持安靜" starts after "主耶和華\n"
    const start = '主耶和華\n'.length;
    const end = start + '保持安靜'.length;
    const out = applyRunPatchToCharRange(slide, 10, start, end, { fontSizePt: 60 });
    expect(out).toContain('sz="6000"');
    expect(out).toContain('val="3333CC"');
    expect(out).toContain('val="800000"');
  });

  it('skips empty spacer paragraphs when computing char offsets', () => {
    const slide =
      '<p:sld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="10" name="T"/></p:nvSpPr><p:spPr/>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/>' +
      '<a:p><a:r><a:rPr sz="2000"/><a:t>AAA</a:t></a:r></a:p>' +
      '<a:p><a:r><a:rPr sz="2000"/><a:t></a:t></a:r></a:p>' +
      '<a:p><a:r><a:rPr sz="2000"><a:solidFill><a:srgbClr val="3333CC"/></a:solidFill></a:rPr>' +
      '<a:t>BBBB</a:t></a:r></a:p>' +
      '</p:txBody></p:sp></p:spTree></p:sld>';
    // textarea plain text is "AAA\nBBBB" — B starts at 4
    const out = applyRunPatchToCharRange(slide, 10, 4, 8, { color: '#FF0000' });
    expect(out).toMatch(/val="FF0000"/);
    expect(out).toContain('BBBB');
  });
});
