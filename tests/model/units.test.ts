import { describe, it, expect } from 'vitest';
import { toDisplay, fromDisplay, formatLen } from '../../src/model/units';

describe('units', () => {
  it('conversions', () => {
    expect(toDisplay(0.0254, 'mil')).toBeCloseTo(1, 12);
    expect(toDisplay(0.035, 'um')).toBeCloseTo(35, 12);
    expect(toDisplay(1.5, 'mm')).toBe(1.5);
    expect(fromDisplay(1, 'mil')).toBeCloseTo(0.0254, 12);
    expect(fromDisplay(35, 'um')).toBeCloseTo(0.035, 12);
  });
  it('round trip returns stored value', () => {
    expect(fromDisplay(toDisplay(0.135, 'mil'), 'mil')).toBe(0.135);
  });
  it('formatLen', () => {
    expect(formatLen(0.135, 'mm', 3)).toBe('0.135 mm');
    expect(formatLen(0.0254, 'mil', 2)).toBe('1.00 mil');
    expect(formatLen(0.035, 'um', 0)).toBe('35 um');
  });
});
