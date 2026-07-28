import { describe, expect, it } from 'vitest';
import {
  computeOfferingTotalAmount,
  formatOfferingUsdForPpt,
  normalizeOfferingAmountInput,
  parseOfferingAmount,
} from './bulletin-offering.js';

describe('bulletin-offering', () => {
  it('parses currency-like input', () => {
    expect(parseOfferingAmount('$3,260.00')).toBe(3260);
    expect(parseOfferingAmount('3000')).toBe(3000);
    expect(parseOfferingAmount('')).toBe(0);
  });

  it('normalizes to two decimal places', () => {
    expect(normalizeOfferingAmountInput('$3,260')).toBe('3260.00');
    expect(normalizeOfferingAmountInput('')).toBe('');
  });

  it('computes total from tithe + other', () => {
    expect(computeOfferingTotalAmount('3260', '3000')).toBe('6260.00');
    expect(computeOfferingTotalAmount('$3,260.00', '$3,000.00')).toBe('6260.00');
    expect(computeOfferingTotalAmount('', '')).toBe('');
  });

  it('formats USD for PPT', () => {
    expect(formatOfferingUsdForPpt('3260')).toBe('$3,260.00');
    expect(formatOfferingUsdForPpt('')).toBe('');
  });
});
