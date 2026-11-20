import { describe, it, expect } from 'vitest';
import { validateStackup, coppers, defaultRefs, etchReduction } from '../../src/model/stackup';
import type { Stackup, CopperLayer, DielectricLayer } from '../../src/model/stackup';
import { exampleStackup } from '../../src/model/example';

const cu = (id: string): CopperLayer => ({ kind: 'copper', id, name: id, role: 'signal', t: 0.035 });
const di = (id: string, t = 0.1): DielectricLayer => ({ kind: 'dielectric', id, material: 'x', type: 'core', t, er: 4, tand: 0.02 });
const mk = (layers: Stackup['layers']): Stackup => ({ ...exampleStackup(), layers });

describe('validateStackup', () => {
  it('example is valid', () => expect(validateStackup(exampleStackup())).toEqual([]));
  it('two coppers adjacent -> error', () => {
    const r = validateStackup(mk([cu('a'), cu('b'), di('d'), cu('c')]));
    expect(r.some((m) => m.level === 'error')).toBe(true);
  });
  it('dielectric t <= 0 -> error', () => {
    const r = validateStackup(mk([cu('a'), di('d', 0), cu('b')]));
    expect(r.some((m) => m.level === 'error' && m.layerId === 'd')).toBe(true);
  });
  it('starting with dielectric -> error', () => {
    const r = validateStackup(mk([di('d'), cu('a'), di('e'), cu('b')]));
    expect(r.some((m) => m.level === 'error')).toBe(true);
  });
  it('NaN values -> error', () => {
    const r = validateStackup(mk([cu('a'), { ...di('d'), er: NaN }, cu('b')]));
    expect(r.some((m) => m.level === 'error' && m.layerId === 'd')).toBe(true);
  });
});

describe('defaultRefs / coppers', () => {
  const s = exampleStackup();
  it('coppers', () => expect(coppers(s).length).toBe(10));
  it('cu5', () => expect(defaultRefs(s, 'cu5')).toEqual({ above: 'cu4', below: 'cu6' }));
  it('cu0', () => expect(defaultRefs(s, 'cu0')).toEqual({ above: null, below: 'cu1' }));
  it('cu2', () => expect(defaultRefs(s, 'cu2')).toEqual({ above: 'cu1', below: 'cu3' }));
});

describe('etchReduction', () => {
  const s = exampleStackup();
  it('fraction 0.7', () => {
    expect(etchReduction(s, 'cu0')).toBeCloseTo(0.0245, 10);
    expect(etchReduction(s, 'cu5')).toBeCloseTo(0.0126, 10);
  });
  it('override factor 2', () => {
    const t = exampleStackup();
    (t.layers.find((l) => l.id === 'cu5') as CopperLayer).etchOverride = { by: 'factor', value: 2 };
    expect(etchReduction(t, 'cu5')).toBeCloseTo(0.018, 10);
  });
});
