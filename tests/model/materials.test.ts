import { describe, it, expect } from 'vitest';
import { PRESETS } from '../../src/model/materials';

describe('material presets', () => {
  it('is non-empty with unique ids', () => {
    expect(PRESETS.length).toBeGreaterThan(0);
    expect(new Set(PRESETS.map((m) => m.id)).size).toBe(PRESETS.length);
  });
  it.each(PRESETS.map((m) => [m.id, m] as const))('%s has traceable, sane values', (_id, m) => {
    expect(m.preset).toBe(true);
    expect(m.source.trim().length).toBeGreaterThan(0);
    expect(m.freq.trim().length).toBeGreaterThan(0);
    expect(m.er).toBeGreaterThanOrEqual(2);
    expect(m.er).toBeLessThanOrEqual(6);
    expect(m.tand).toBeGreaterThan(0);
    expect(m.tand).toBeLessThan(0.05);
  });
  it('generic FR4 is labelled as a rough default', () => {
    const fr4 = PRESETS.find((m) => m.er === 4.3 && m.tand === 0.02);
    expect(fr4?.source).toBe('Rough generic default, not from a datasheet');
  });
  it('ships no unverified Isola glass-style values', () => {
    for (const m of PRESETS) {
      expect([4.35, 3.93]).not.toContain(m.er);
    }
  });
});
