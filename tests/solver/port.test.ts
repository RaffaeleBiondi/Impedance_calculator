import { describe, expect, it } from 'vitest';
import { legacy } from '../helpers/legacy';
import { richDiff, richSE } from '../../src/solver/line';
import { compact, rootLog } from '../../src/solver/synth';
import { ellipK } from '../../src/solver/elliptic';
import type { BuildFn, Mode } from '../../src/solver/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const stripIn5 = { type: 'strip', T: 0.018, H1: 0.2, er1: 4.35, H2: 0.14, er2: 3.93, erf: 3.93, G: null, W: 0.135 };
const microF = { type: 'micro', T: 0.035, H: 0.12, er: 4.17, tm: 0.01, erm: 3.3, G: null, W: 0.2 };
const microT0 = { type: 'micro', T: 0, H: 0.12, er: 3.9, tm: 0, erm: 1, G: null, W: 0.12 };

const cases: { name: string; g: any; kind: 'se' | 'diff'; qs: number[] }[] = [
  { name: 'strip-In5', g: stripIn5, kind: 'se', qs: [1, 2] },
  { name: 'micro-F', g: microF, kind: 'se', qs: [1, 2] },
  { name: 'micro-F-cpw', g: { ...microF, G: 0.15 }, kind: 'se', qs: [1] },
  { name: 'micro-T0', g: microT0, kind: 'se', qs: [1] },
  { name: 'strip-diff', g: { ...stripIn5, W: 0.125, S: 0.315 }, kind: 'diff', qs: [1, 2] },
  { name: 'micro-diff', g: { ...microF, W: 0.17, S: 0.27 }, kind: 'diff', qs: [1] },
  { name: 'micro-diff-cpw', g: { ...microF, W: 0.21, S: 0.25, G: 0.3 }, kind: 'diff', qs: [1] },
];

const builder = (g: any): BuildFn => (mode: Mode, q: number) =>
  legacy.buildProblem({ ...g, S: mode === 'se' ? 0 : g.S }, mode, q);
const order = (g: any): number => (g.T > 0 ? 1.5 : 1);

function expectClose(a: number, b: number, label: string): void {
  const rel = Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  expect(rel, `${label}: ts=${a} legacy=${b}`).toBeLessThanOrEqual(1e-9);
}

describe('V0: TS port equals legacy JS', () => {
  for (const c of cases) {
    for (const q of c.qs) {
      it(`${c.name} q=${q}`, () => {
        const ts: any = c.kind === 'se' ? richSE(builder(c.g), q, order(c.g)) : richDiff(builder(c.g), q, order(c.g));
        const lg: any = c.kind === 'se' ? legacy.SE(c.g, q) : legacy.DIFF(c.g, q);
        const keys = c.kind === 'se'
          ? ['Z0', 'eeff', 'tpd', 'C', 'nodes', 'iters', 'meshDelta']
          : ['Zodd', 'Zeven', 'Zdiff', 'Zcm', 'eodd', 'eeven', 'tpdOdd', 'kb', 'nodes', 'iters', 'meshDelta'];
        for (const k of keys) expectClose(ts[k], lg[k], `${c.name} q=${q} ${k}`);
        expect(ts.field.V.length).toBe(ts.field.xs.length * ts.field.ys.length);
      });
    }
  }

  const seZ = (g: any) => (W: number): number =>
    richSE(builder({ ...g, W }), 1, order(g)).Z0;
  const dZ = (g: any) => (W: number, S: number): number =>
    richDiff(builder({ ...g, W, S }), 1, order(g)).Zdiff;

  it('rootLog reproduces legacy findW on strip-In5', () => {
    const ts = rootLog(seZ(stripIn5), 50, 0.02, 3, 0.005);
    const lg = legacy.findW(stripIn5, 50, false, 1, 0.02, 3);
    expect(ts.x).not.toBeNull();
    expectClose(ts.x as number, lg.x, 'findW x');
    expect(ts.n).toBe(lg.n);
  });

  it('compact reproduces legacy compact on strip-In5 (diff)', () => {
    const o = { target: 100, tol: 0.05, diff: true, wmin: 0.125, smin: 0.125, step: 0.005 };
    const ts: any = compact(o, undefined, dZ(stripIn5));
    const lg: any = legacy.compact(stripIn5, { ...o, q: 1 });
    expect(ts.ok).toBe(lg.ok);
    expect(ts.bound).toBe(lg.bound);
    expect(ts.W).toBe(lg.W);
    expect(ts.S).toBe(lg.S);
    expectClose(ts.z, lg.z, 'compact z');
  });

  it('compact reproduces legacy compact on strip-In5 (single-ended)', () => {
    const o = { target: 50, tol: 0.05, diff: false, wmin: 0.125, smin: 0.125, step: 0.005 };
    const ts: any = compact(o, seZ(stripIn5), undefined);
    const lg: any = legacy.compact(stripIn5, { ...o, q: 1 });
    expect(ts.ok).toBe(lg.ok);
    expect(ts.bound).toBe(lg.bound);
    expect(ts.W).toBe(lg.W);
  });

  it('ellipK matches known values', () => {
    expect(ellipK(0)).toBeCloseTo(Math.PI / 2, 14);
    expect(ellipK(Math.SQRT1_2)).toBeCloseTo(1.8540746773013719, 12);
  });
});
