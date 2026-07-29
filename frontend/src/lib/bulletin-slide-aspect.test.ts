import { describe, expect, it } from 'vitest';
import {
  BULLETIN_TEMPLATE_SLIDE_ASPECT,
  BULLETIN_TEMPLATE_SLIDE_SIZE,
  slideAspectRatioStyle,
} from './bulletin-slide-aspect';

describe('bulletin-slide-aspect', () => {
  it('matches template widescreen EMU (10" × 5.625")', () => {
    expect(BULLETIN_TEMPLATE_SLIDE_SIZE.cx / BULLETIN_TEMPLATE_SLIDE_SIZE.cy).toBeCloseTo(16 / 9, 10);
    expect(BULLETIN_TEMPLATE_SLIDE_ASPECT).toBe('9144000 / 5143500');
  });

  it('builds CSS aspect-ratio from slide size', () => {
    expect(slideAspectRatioStyle()).toEqual({ aspectRatio: '9144000 / 5143500' });
    expect(slideAspectRatioStyle({ cx: 12192000, cy: 6858000 })).toEqual({
      aspectRatio: '12192000 / 6858000',
    });
  });
});
