import { describe, it, expect } from 'vitest';
import { encodeHash, decodeHash } from '../../src/io/urlState';
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
