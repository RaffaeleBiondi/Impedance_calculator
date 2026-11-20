import { describe, it, expect } from 'vitest';
import { encodeHash, decodeHash, MAX_HASH_CHARS } from '../../src/io/urlState';
import { defaultAppState } from '../../src/state/types';

describe('URL hash state', () => {
  it('round-trips the default state', () => {
    const s = defaultAppState();
    const h = encodeHash(s);
    expect(h.startsWith('#s=')).toBe(true);
    const d = decodeHash(h);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.state).toEqual(s);
  });
  it('defaults match the rulings', () => {
    const s = defaultAppState();
    expect(s.tableLayers).toEqual(['cu0', 'cu2', 'cu5', 'cu7', 'cu9']);
    expect(s.calc.layerId).toBe('cu5');
    expect(s.classes.map((c) => c.name)).toEqual(['SE 50', 'DIFF 100', 'DIFF 90']);
  });
  it('rejects garbage', () => {
    expect(decodeHash('#s=garbage').ok).toBe(false);
    expect(decodeHash('').ok).toBe(false);
  });
  it('rejects a state with a bad calc field', () => {
    const s = defaultAppState() as unknown as { calc: { W: unknown } };
    s.calc.W = 'x';
    expect(decodeHash(encodeHash(s as never)).ok).toBe(false);
  });
});

describe('calc/class/table validation', () => {
  const bad = (mut: (s: any) => void) => {
    const s: any = structuredClone(defaultAppState());
    mut(s);
    return decodeHash(encodeHash(s)).ok;
  };
  it.each([
    ['W<=0', (s: any) => { s.calc.W = 0; }],
    ['target<=0', (s: any) => { s.calc.target = -1; }],
    ['freqGHz<=0', (s: any) => { s.calc.freqGHz = 0; }],
    ['S<0', (s: any) => { s.calc.S = -0.1; }],
    ['G<0', (s: any) => { s.calc.G = -1; }],
    ['fmin<=0', (s: any) => { s.calc.fmin = 0; }],
    ['tol<=0', (s: any) => { s.calc.tol = 0; }],
    ['L1<0', (s: any) => { s.calc.L1 = -1; }],
    ['L2<0', (s: any) => { s.calc.L2 = -1; }],
    ['stale tableLayers id', (s: any) => { s.tableLayers.push('ghost'); }],
    ['class target<=0', (s: any) => { s.classes[0].target = 0; }],
    ['class G<0', (s: any) => { s.classes[0].G = -1; }],
    ['class gap<=0', (s: any) => { s.classes[0].rule = { kind: 'fixed-gap', gap: 0 }; }],
    ['class pitch<=0', (s: any) => { s.classes[0].rule = { kind: 'fixed-pitch', pitch: -2 }; }],
  ])('rejects %s', (_n, m) => { expect(bad(m)).toBe(false); });
  it('accepts S=0, G=0 and L1/L2 = 0', () => {
    expect(bad((s: any) => { s.calc.S = 0; s.calc.G = 0; s.calc.L1 = 0; s.calc.L2 = 5; })).toBe(true);
  });
  it('rejects a truncated hash', () => {
    const h = encodeHash(defaultAppState());
    expect(decodeHash(h.slice(0, Math.floor(h.length / 2))).ok).toBe(false);
  });
  it('refuses a hash longer than 100 000 characters before decompressing', () => {
    expect(MAX_HASH_CHARS).toBe(100_000);
    const d = decodeHash('#s=' + 'A'.repeat(100_000));
    expect(d).toEqual({ ok: false, error: 'Share link too long' });
  });
  it('refuses a short hash that decompresses to more than 2 MB of JSON', () => {
    const s = defaultAppState();
    s.stackup.name = 'x'.repeat(2.5 * 1024 * 1024);
    const h = encodeHash(s);
    expect(h.length).toBeLessThan(100_000);
    const d = decodeHash(h);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toMatch(/too large/);
  });
});
