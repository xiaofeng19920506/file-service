import { describe, expect, it } from 'vitest';
import {
  BULLETIN_TEMPLATE_SLIDE_ASPECT,
  BULLETIN_TEMPLATE_SLIDE_SIZE,
  slideAspectRatioStyle,
} from './bulletin-slide-aspect';

describe('bulletin-slide-aspect', () => {
  it('uses 16/9 for the template sldSz (9144000×5143500)', () => {
    expect(BULLETIN_TEMPLATE_SLIDE_SIZE.cx / BULLETIN_TEMPLATE_SLIDE_SIZE.cy).toBeCloseTo(16 / 9, 10);
    expect(BULLETIN_TEMPLATE_SLIDE_ASPECT).toBe('16 / 9');
    expect(slideAspectRatioStyle()).toEqual({ aspectRatio: '16 / 9' });
  });

  it('reduces custom slide sizes to a simple ratio', () => {
    expect(slideAspectRatioStyle({ cx: 12192000, cy: 6858000 })).toEqual({
      aspectRatio: '16 / 9',
    });
    expect(slideAspectRatioStyle({ cx: 9144000, cy: 6858000 })).toEqual({
      aspectRatio: '4 / 3',
    });
  });
});
