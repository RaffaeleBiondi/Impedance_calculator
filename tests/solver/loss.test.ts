import { describe, expect, it } from 'vitest';
import { sel, stack, xsOf } from '../helpers/stackups';
import { analyze, makeBuild } from '../../src/solver/engine';
import { alphaDbPerM, delayPs, skewPs } from '../../src/solver/derived';
import type { Stackup } from '../../src/model/stackup';

const C0 = 299792458;
const rel = (a: number, b: number): number => Math.abs(a / b - 1);

/** Homogeneous stripline: planes cu0 / cu2, trace on cu1, b = 0.4 mm plane to plane. */
function stripline(): Stackup {
  const T = 0.035, h = (0.4 - T) / 2;
  return stack([['cu', 0.035, 'plane'], ['d', h, 4], ['cu', T, 'signal'], ['d', h, 4], ['cu', 0.035, 'plane']]);
}
function micro(er: number): Stackup {
  return stack([['cu', 0.035, 'signal'], ['d', 0.12, er], ['cu', 0.035, 'plane']]);
}
function setTand(s: Stackup, tand: number): Stackup {
  for (const l of s.layers) if (l.kind === 'dielectric') l.tand = tand;
  return s;
}

describe('V14 dielectric loss', () => {
  it('homogeneous stripline: loss within 0.1 % of exact', () => {
    const s = setTand(stripline(), 0.02);
    const r = analyze({ stackup: s, sel: sel('cu1', 'cu0', 'cu2'), line: { type: 'se', W: 0.15, etch: false }, q: 1, freqGHz: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== 'se') return;
    const exact = 8.686 * Math.PI * 1e9 * 2 * 0.02 / C0;
    expect(rel(r.lossDbPerM as number, exact)).toBeLessThan(1e-3);
    expect(rel(r.r.tandEff as number, 0.02)).toBeLessThan(1e-6);
  });

  it('single-dielectric microstrip: tandEff = (er/eeff) d(eeff)/d(er) tand within 0.5 %', () => {
    const tand = 0.02, er = 4;
    const run = (e: number) => {
      const r = analyze({ stackup: setTand(micro(e), tand), sel: sel('cu0', null, 'cu1'), line: { type: 'se', W: 0.2, etch: false }, q: 1 });
      if (!r.ok || r.kind !== 'se') throw new Error('analyze failed');
      return r.r;
    };
    const mid = run(er), lo = run(er - 0.01), hi = run(er + 0.01);
    const expected = (er / mid.eeff) * ((hi.eeff - lo.eeff) / 0.02) * tand;
    expect(rel(mid.tandEff as number, expected)).toBeLessThan(5e-3);
  });

  it('loss is absent without frequency; diff reports odd-mode tandEff and loss', () => {
    const a = { stackup: setTand(micro(4), 0.02), sel: sel('cu0', null, 'cu1'), line: { type: 'diff' as const, W: 0.2, S: 0.2, etch: false }, q: 1 };
    const none = analyze(a);
    expect(none.ok && none.lossDbPerM).toBeUndefined();
    const r = analyze({ ...a, freqGHz: 5 });
    if (!r.ok || r.kind !== 'diff') throw new Error('analyze failed');
    expect(r.r.tandEffOdd).toBeGreaterThan(0);
    expect(r.r.tandEffOdd).toBeLessThan(0.02);
    expect(r.lossDbPerM).toBeCloseTo(alphaDbPerM(5, r.r.eodd, r.r.tandEffOdd as number), 10);
  });

  it('air-only tand and zero-tand dielectrics give tandEff 0', () => {
    const r = analyze({ stackup: setTand(micro(4), 0), sel: sel('cu0', null, 'cu1'), line: { type: 'se', W: 0.2, etch: false }, q: 1, freqGHz: 1 });
    if (!r.ok || r.kind !== 'se') throw new Error('analyze failed');
    expect(r.r.tandEff).toBe(0);
    expect(r.lossDbPerM).toBe(0);
  });
});

describe('derived helpers', () => {
  it('delay and skew', () => {
    expect(skewPs(7, 100, 98)).toBeCloseTo(14, 12);
    expect(skewPs(7, 98, 100)).toBeCloseTo(14, 12);
    expect(delayPs(7, 0)).toBe(0);
    expect(delayPs(7, 100)).toBe(700);
  });
});

describe('Task 5 rulings', () => {
  it('no-reference pair: even-mode quantities are NaN, odd mode finite', () => {
    const r = analyze({ stackup: micro(4), sel: sel('cu0', null, null), line: { type: 'diff', W: 0.2, S: 0.2, etch: false }, q: 1 });
    if (!r.ok || r.kind !== 'diff') throw new Error('analyze failed');
    expect(r.oddOnly).toBe(true);
    for (const k of ['Zeven', 'Zcm', 'eeven', 'kb'] as const) expect(Number.isNaN(r.r[k])).toBe(true);
    expect(Number.isFinite(r.r.Zodd)).toBe(true);
    expect(Number.isFinite(r.r.Zdiff)).toBe(true);
  });

  it('odd/even problem without S throws a clear error', () => {
    const xs = xsOf(micro(4), sel('cu0', null, 'cu1'));
    const b = makeBuild(xs, { W: 0.2 });
    expect(() => b('odd', 1)).toThrow(/Gap S/);
    expect(() => b('even', 1)).toThrow(/Gap S/);
    expect(() => makeBuild(xs, { W: 0.2, S: 0 })('odd', 1)).toThrow(/Gap S/);
    expect(() => b('se', 1)).not.toThrow();
  });
});
