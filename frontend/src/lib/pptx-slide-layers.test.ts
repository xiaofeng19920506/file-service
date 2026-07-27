import { describe, expect, it } from 'vitest';
import { trimEdgeBlankParagraphs, type SlideTextParagraph } from './pptx-slide-layers';

function textPara(text: string): SlideTextParagraph {
  return {
    runs: [{ text, color: '#000', bold: false, italic: false }],
    align: 'center',
    lineSpacing: 1,
  };
}

function spacerPara(heightPt = 40): SlideTextParagraph {
  return {
    runs: [],
    align: 'left',
    lineSpacing: 1,
    spacer: true,
    spacerHeightPt: heightPt,
  };
}

function blankRunPara(): SlideTextParagraph {
  return {
    runs: [{ text: '   ', color: '#000', bold: false, italic: false }],
    align: 'left',
    lineSpacing: 1,
  };
}

describe('trimEdgeBlankParagraphs', () => {
  it('trims leading/trailing spacers used as Google padding (worship title)', () => {
    const input = [
      blankRunPara(),
      spacerPara(40),
      blankRunPara(),
      spacerPara(50),
      textPara('敬拜讚美'),
      blankRunPara(),
    ];
    const out = trimEdgeBlankParagraphs(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.runs[0]?.text).toBe('敬拜讚美');
  });

  it('keeps middle spacers between real paragraphs (cover layout)', () => {
    const input = [textPara('上段'), spacerPara(20), textPara('下段')];
    const out = trimEdgeBlankParagraphs(input);
    expect(out).toHaveLength(3);
    expect(out[1]?.spacer).toBe(true);
  });

  it('leaves a single paragraph unchanged', () => {
    const input = [textPara('只有一行')];
    expect(trimEdgeBlankParagraphs(input)).toEqual(input);
  });
});
