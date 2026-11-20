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
  it('ships the verified 370HR Rev I table rows at 1 GHz', () => {
    const get = (id: string) => PRESETS.find((m) => m.id === id);
    const core = get('isola-370hr-core-1x7628-46');
    const p1080 = get('isola-370hr-prepreg-1080-61');
    const p2116 = get('isola-370hr-prepreg-2116-56');
    expect([core?.er, core?.tand, core?.type]).toEqual([4.28, 0.018, 'core']);
    expect([p1080?.er, p1080?.tand, p1080?.type]).toEqual([3.92, 0.02, 'prepreg']);
    expect([p2116?.er, p2116?.tand, p2116?.type]).toEqual([4.08, 0.02, 'prepreg']);
    for (const m of [core, p1080, p2116]) {
      expect(m?.freq).toBe('1 GHz');
      expect(m?.source).toMatch(/Revision I \(24 Feb 2026\)/);
    }
  });
  it('cites the official Rogers RO4000 data sheet for the Rogers presets, values unchanged', () => {
    const got = ['rogers-ro4350b', 'rogers-ro4003c'].map((id) => PRESETS.find((m) => m.id === id));
    expect(got.map((m) => [m?.er, m?.tand])).toEqual([[3.66, 0.0037], [3.55, 0.0027]]);
    for (const m of got) {
      expect(m?.source).toMatch(/Rogers PUB 92-004/);
      expect(m?.source).toMatch(/https:\/\/www\.rogerscorp\.com\//);
      expect(m?.source).not.toMatch(/hosted by|not the Rogers site/i);
    }
  });
});
