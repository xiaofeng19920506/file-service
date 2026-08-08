import { describe, expect, it } from 'vitest';
import {
  coercePresentableSlide,
  firstPresentableSlide,
  lastPresentableSlide,
  stepPresentableSlide,
} from './bulletin-slideshow-navigation';

describe('bulletin-slideshow-navigation', () => {
  const skip = new Set([3, 4, 10]);

  it('steps forward/backward over skipped slides', () => {
    expect(stepPresentableSlide(2, 1, 12, skip)).toBe(5);
    expect(stepPresentableSlide(5, -1, 12, skip)).toBe(2);
    expect(stepPresentableSlide(9, 1, 12, skip)).toBe(11);
    expect(stepPresentableSlide(11, -1, 12, skip)).toBe(9);
  });

  it('stays put at ends when next/prev are all skipped', () => {
    expect(stepPresentableSlide(1, -1, 12, skip)).toBe(1);
    expect(stepPresentableSlide(12, 1, 12, skip)).toBe(12);
  });

  it('coerces start onto a presentable slide', () => {
    expect(coercePresentableSlide(3, 12, skip)).toBe(5);
    expect(coercePresentableSlide(1, 12, skip)).toBe(1);
    expect(firstPresentableSlide(12, skip)).toBe(1);
    expect(lastPresentableSlide(12, skip)).toBe(12);
  });
});
