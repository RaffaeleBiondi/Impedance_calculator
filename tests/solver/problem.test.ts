import { describe, expect, it } from 'vitest';
import { legacy } from '../helpers/legacy';
import { innerB, outerB, sel, stack, xsOf } from '../helpers/stackups';
import { exampleStackup } from '../../src/model/example';
import { etchReduction, type Stackup } from '../../src/model/stackup';
import type { CrossSection } from '../../src/model/crossSection';
import { buildProblem, GeometryError, MAX_NODES, type LineGeom } from '../../src/solver/problem';
import { analyze, makeBuild, richOrder, TRAP_ORDER } from '../../src/solver/engine';
import { makeGrid } from '../../src/solver/grid';
import { richDiff, richSE } from '../../src/solver/line';
import type { Mode, Problem } from '../../src/solver/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const rel = (a: number, b: number): number => Math.abs(a / b - 1);

function exampleNoMask(): Stackup {
  const s = exampleStackup();
  s.maskTop = { t: 0, er: 3.3, tand: 0.02 };
  s.maskBottom = { t: 0, er: 3.3, tand: 0.02 };
  return s;
}
const xsCu5 = (): CrossSection => xsOf(exampleStackup(), sel('cu5', 'cu4', 'cu6'));
const xsFCu = (s = exampleStackup()): CrossSection => xsOf(s, sel('cu0', null, 'cu1'));

// Legacy geometry mapping (spec Appendix B).
const gIn5 = { type: 'strip', T: 0.018, H1: 0.2, er1: 4.35, H2: 0.14, er2: 3.93, erf: 3.93 };
const gFCu0 = { type: 'micro', T: 0.035, H: 0.12, er: 4.17, tm: 0, erm: 3.3 };

const v2cases: { name: string; xs: () => CrossSection; g: any; line: LineGeom; kind: 'se' | 'diff' }[] = [
  { name: 'cu5 SE 0.135', xs: xsCu5, g: { ...gIn5, W: 0.135, G: null }, line: { W: 0.135 }, kind: 'se' },
  { name: 'cu5 diff 0.125/0.315', xs: xsCu5, g: { ...gIn5, W: 0.125, S: 0.315, G: null }, line: { W: 0.125, S: 0.315 }, kind: 'diff' },
  { name: 'cu5 SE CPW G 0.2', xs: xsCu5, g: { ...gIn5, W: 0.135, G: 0.2 }, line: { W: 0.135, G: 0.2 }, kind: 'se' },
  { name: 'F.Cu no mask SE 0.20', xs: () => xsFCu(exampleNoMask()), g: { ...gFCu0, W: 0.2, G: null }, line: { W: 0.2 }, kind: 'se' },
  { name: 'F.Cu no mask diff 0.17/0.27', xs: () => xsFCu(exampleNoMask()), g: { ...gFCu0, W: 0.17, S: 0.27, G: null }, line: { W: 0.17, S: 0.27 }, kind: 'diff' },
  { name: 'F.Cu no mask CPWG 0.20 G 0.15', xs: () => xsFCu(exampleNoMask()), g: { ...gFCu0, W: 0.2, G: 0.15 }, line: { W: 0.2, G: 0.15 }, kind: 'se' },
];

describe('V2: legacy equivalence on unmasked legacy topologies', () => {
  for (const c of v2cases) {
    for (const q of [1, 2]) {
      it(`${c.name} q=${q}`, () => {
        const xs = c.xs();
        const modes: Mode[] = c.kind === 'se' ? ['se'] : ['odd', 'even'];
        for (const mode of modes) {
          const p = buildProblem(xs, c.line, mode, q);
          const lp = legacy.buildProblem({ ...c.g, S: mode === 'se' ? 0 : c.g.S }, mode, q);
          for (const k of ['keysX', 'keysY', 'fineX', 'fineY'] as const) {
            expect(p[k].length, k).toBe(lp[k].length);
            p[k].forEach((v: number, i: number) => expect(Math.abs(v - lp[k][i]), `${k}[${i}]`).toBeLessThanOrEqual(1e-12));
          }
          for (const k of ['hmin', 'hmax', 'hmaxY', 'growth', 'xmax', 'ymax'] as const) {
            expect(Math.abs((p as any)[k] - lp[k]), k).toBeLessThanOrEqual(1e-12);
          }
          expect(p.leftBC).toBe(lp.leftBC);
          expect(p.topBC).toBe(lp.topBC);
          const g = makeGrid(p), lg = legacy.makeGrid(lp);
          expect(g.xs.length).toBe(lg.xs.length);
          expect(g.ys.length).toBe(lg.ys.length);
          g.xs.forEach((v, i) => expect(Math.abs(v - lg.xs[i])).toBeLessThanOrEqual(1e-12));
          g.ys.forEach((v, i) => expect(Math.abs(v - lg.ys[i])).toBeLessThanOrEqual(1e-12));
        }
        const build = makeBuild(xs, c.line);
        const order = richOrder(xs.T);
        if (c.kind === 'se') {
          const r = richSE(build, q, order), l = legacy.SE(c.g, q);
          expect(rel(r.Z0, l.Z0)).toBeLessThanOrEqual(1e-9);
          expect(rel(r.eeff, l.eeff)).toBeLessThanOrEqual(1e-9);
        } else {
          const r = richDiff(build, q, order), l = legacy.DIFF(c.g, q);
          for (const k of ['Zodd', 'Zeven', 'Zdiff', 'eodd', 'eeven'] as const) expect(rel(r[k], l[k]), k).toBeLessThanOrEqual(1e-9);
        }
      });
    }
  }
});

describe('V8: homogeneous cross-sections give eeff = er', () => {
  const er = 4;
  const strip4 = (): Stackup => stack([
    ['cu', 0.035, 'signal'], ['d', 0.12, er], ['cu', 0.035], ['d', 0.2, er, 'core'], ['cu', 0.018, 'signal'],
    ['d', 0.14, er], ['cu', 0.018, 'signal'], ['d', 0.2, er, 'core'], ['cu', 0.035], ['d', 0.12, er], ['cu', 0.035, 'signal'],
  ]);
  const cases: { name: string; xs: () => CrossSection; line: LineGeom; kind: 'se' | 'diff' }[] = [
    { name: 'asymmetric stripline SE', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu3')), line: { W: 0.15 }, kind: 'se' },
    { name: 'skip-layer stripline SE', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu4')), line: { W: 0.15 }, kind: 'se' },
    { name: 'skip-layer stripline diff', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu4')), line: { W: 0.12, S: 0.2 }, kind: 'diff' },
    { name: 'CPW in stripline', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu3')), line: { W: 0.15, G: 0.12 }, kind: 'se' },
    { name: 'trapezoid stripline SE', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu3')), line: { W: 0.15, Wtop: 0.15 - 0.7 * 0.018 }, kind: 'se' },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const xs = c.xs();
      const b = makeBuild(xs, c.line);
      if (c.kind === 'se') expect(rel(richSE(b, 1, b.order).eeff, er)).toBeLessThanOrEqual(1e-4);
      else {
        const r = richDiff(b, 1, b.order);
        expect(rel(r.eodd, er)).toBeLessThanOrEqual(1e-4);
        expect(rel(r.eeven, er)).toBeLessThanOrEqual(1e-4);
      }
    });
  }
  it('embedded microstrip with all er 4 is NOT homogeneous (air above the open cover)', () => {
    const xs = xsOf(strip4(), sel('cu2', 'cu1', null));
    expect(xs.topology).toBe('embedded-microstrip');
    const e = richSE(makeBuild(xs, { W: 0.15 }), 1, 1.5).eeff;
    expect(e).toBeLessThan(er * (1 - 1e-4));
    expect(e).toBeGreaterThan(er * 0.95);
  });
});

describe('V13 limits: trapezoid', () => {
  const cases: { name: string; xs: () => CrossSection; layerId: string; W: number }[] = [
    { name: 'F.Cu SE 0.20 (masked)', xs: () => xsFCu(), layerId: 'cu0', W: 0.2 },
    { name: 'cu5 SE 0.135', xs: xsCu5, layerId: 'cu5', W: 0.135 },
  ];
  for (const c of cases) {
    it(`${c.name}: Wtop = W equals the rectangle`, () => {
      const xs = c.xs();
      const ba = makeBuild(xs, { W: c.W }), bb = makeBuild(xs, { W: c.W, Wtop: c.W });
      expect(bb.order).toBe(ba.order);
      expect(rel(richSE(bb, 1, bb.order).Z0, richSE(ba, 1, ba.order).Z0)).toBeLessThanOrEqual(1e-9);
    });
    it(`${c.name}: rect(Wtop) >= trap >= rect(W)`, () => {
      const xs = c.xs();
      const Wtop = c.W - etchReduction(exampleStackup(), c.layerId);
      expect(Wtop).toBeCloseTo(c.W - 0.7 * xs.T, 12);
      const z = (line: LineGeom): number => { const b = makeBuild(xs, line); return richSE(b, 1, b.order).Z0; };
      const zW = z({ W: c.W }), zTop = z({ W: Wtop }), zTrap = z({ W: c.W, Wtop });
      expect(zTop).toBeGreaterThan(zTrap);
      expect(zTrap).toBeGreaterThan(zW);
    });
  }
});

/** Every material and conductor edge inside the domain must be a grid line (spec §6.3). */
function expectEdgesOnGrid(p: Problem): void {
  const g = makeGrid(p);
  const onAxis = (ax: Float64Array, v: number): boolean => ax.some((a) => Math.abs(a - v) <= 1e-9);
  const rects = [...p.diel, ...p.cond];
  for (const r of rects) {
    for (const x of [r.x0, r.x1]) if (x > 1e-9 && x < p.xmax - 1e-9) expect(onAxis(g.xs, x), `x edge ${x}`).toBe(true);
    for (const y of [r.y0, r.y1]) if (y > 1e-9 && y < p.ymax - 1e-9) expect(onAxis(g.ys, y), `y edge ${y}`).toBe(true);
  }
}

describe('grid-line invariant across topologies', () => {
  const ex = exampleStackup();
  const cases: { name: string; xs: () => CrossSection; line: LineGeom }[] = [
    { name: 'masked microstrip SE', xs: () => xsFCu(), line: { W: 0.2 } },
    { name: 'masked microstrip diff + G (trap)', xs: () => xsFCu(), line: { W: 0.17, S: 0.27, G: 0.2, Wtop: 0.17 - 0.0245 } },
    { name: 'masked diff with S < 2 tm', xs: () => xsFCu(), line: { W: 0.17, S: 0.015 } },
    { name: 'stripline trap diff', xs: xsCu5, line: { W: 0.125, S: 0.315, Wtop: 0.125 - 0.0126 } },
    { name: 'embedded microstrip', xs: () => xsOf(ex, sel('cu2', 'cu1', null)), line: { W: 0.15 } },
    { name: 'embedded, cover-side ref only', xs: () => xsOf(ex, sel('cu2', null, 'cu3')), line: { W: 0.15 } },
    { name: 'skip-layer stripline', xs: () => xsOf(ex, sel('cu5', 'cu3', 'cu6')), line: { W: 0.15 } },
    { name: 'CPW no ground (outer)', xs: () => xsOf(ex, sel('cu0', null, null)), line: { W: 0.2, G: 0.15 } },
    { name: 'B.Cu microstrip', xs: () => xsOf(ex, sel('cu9', 'cu8', null)), line: { W: 0.2, Wtop: 0.2 - 0.0245 } },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const xs = c.xs();
      for (const mode of (c.line.S ? ['odd', 'even'] : ['se']) as Mode[]) expectEdgesOnGrid(buildProblem(xs, c.line, mode, 1));
    });
  }
  it('open base side: far boundary at y = 0 under air, open mask, base slabs', () => {
    const xs = xsOf(ex, sel('cu2', null, 'cu3')); // base = core above In2, no ref there
    expect(xs.baseRef).toBe(false);
    const p = buildProblem(xs, { W: 0.15 }, 'se', 1);
    const Hc = xs.cover.reduce((a, s) => a + s.t, 0);
    const D = Math.max(30 * Hc, 6 * 0.15);
    // nothing below y = D is dielectric: the air layer sits on the grounded far boundary
    expect(p.diel.every((d) => d.y0 >= D - 1e-12)).toBe(true);
    expect(p.diel.some((d) => Math.abs(d.y0 - D) < 1e-12 && d.er === ex.maskTop.er)).toBe(true);
  });
  it('T = 0 cross-sections are supported', () => {
    const xs = { ...xsCu5(), T: 0 };
    const r = richSE(makeBuild(xs, { W: 0.135, Wtop: 0.12 }), 1, richOrder(0));
    expect(Number.isFinite(r.Z0)).toBe(true);
  });
});

describe('Richardson order', () => {
  it('1.5 for T > 0, 1 for T = 0, TRAP_ORDER for a real trapezoid only', () => {
    const xs = xsCu5();
    expect(makeBuild(xs, { W: 0.135 }).order).toBe(1.5);
    expect(makeBuild(xs, { W: 0.135, Wtop: 0.135 }).order).toBe(1.5);
    expect(makeBuild(xs, { W: 0.135, Wtop: 0.12 }).order).toBe(TRAP_ORDER);
    expect(makeBuild({ ...xs, T: 0 }, { W: 0.135, Wtop: 0.12 }).order).toBe(1);
  });
});

describe('analyze', () => {
  const ex = exampleStackup();
  it('cu5 SE 0.135 at q 1', () => {
    const r = analyze({ stackup: ex, sel: sel('cu5', 'cu4', 'cu6'), line: { type: 'se', W: 0.135, etch: false }, q: 1 });
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === 'se') expect(r.r.Z0).toBeCloseTo(50.04, 1);
  });
  it('etch: wtop is reported', () => {
    const r = analyze({ stackup: ex, sel: sel('cu5', 'cu4', 'cu6'), line: { type: 'se', W: 0.135, etch: true }, q: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.wtop).toBeCloseTo(0.135 - 0.7 * 0.018, 12);
  });
  it('no reference: SE refused', () => {
    const r = analyze({ stackup: ex, sel: sel('cu0', null, null), line: { type: 'se', W: 0.2, etch: false }, q: 1 });
    expect(r).toEqual({ ok: false, error: 'No reference: single-ended needs a plane or coplanar GND' });
  });
  it('no reference: pair gives odd mode only', () => {
    const r = analyze({ stackup: ex, sel: sel('cu0', null, null), line: { type: 'diff', W: 0.2, S: 0.2, etch: false }, q: 1 });
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === 'diff') {
      expect(r.oddOnly).toBe(true);
      expect(Number.isFinite(r.r.Zdiff)).toBe(true);
    }
  });
  it('no reference but coplanar GND: SE allowed, pair not odd-only', () => {
    const a = analyze({ stackup: ex, sel: sel('cu0', null, null), line: { type: 'se', W: 0.2, G: 0.15, etch: false }, q: 1 });
    expect(a.ok).toBe(true);
    const b = analyze({ stackup: ex, sel: sel('cu0', null, null), line: { type: 'diff', W: 0.2, S: 0.2, G: 0.15, etch: false }, q: 1 });
    expect(b.ok && b.kind === 'diff' && b.oddOnly).toBe(false);
  });
  it('rejects W, S, G <= 0 and Wtop <= 0', () => {
    const base = { stackup: ex, sel: sel('cu5', 'cu4', 'cu6'), q: 1 };
    expect(analyze({ ...base, line: { type: 'se', W: 0, etch: false } }).ok).toBe(false);
    expect(analyze({ ...base, line: { type: 'diff', W: 0.1, S: 0, etch: false } }).ok).toBe(false);
    expect(analyze({ ...base, line: { type: 'se', W: 0.1, G: -1, etch: false } }).ok).toBe(false);
    expect(analyze({ ...base, line: { type: 'se', W: 0.01, etch: true } }).ok).toBe(false); // 0.01 - 0.0126 < 0
  });
  it('passes cross-section errors through', () => {
    const r = analyze({ stackup: ex, sel: sel('cu5', 'cu6', 'cu4'), line: { type: 'se', W: 0.1, etch: false }, q: 1 });
    expect(r.ok).toBe(false);
  });
});

describe('node cap and extreme geometry (Review Focus 3)', () => {
  it(`W 0.02 over a 3 mm base slab at q 2: solves under ${MAX_NODES} nodes, no hang`, () => {
    const s = stack([['cu', 0.035, 'signal'], ['d', 3, 4.2, 'core'], ['cu', 0.035]], { t: 0.01, er: 3.3, tand: 0.02 });
    const r = analyze({ stackup: s, sel: sel('cu0', null, 'cu1'), line: { type: 'se', W: 0.02, etch: false }, q: 2 });
    PIN_NODE_CAP(r);
  }, 20_000);
  it('the same case at q 8 is refused before any solve (GeometryError → ok:false)', () => {
    const s = stack([['cu', 0.035, 'signal'], ['d', 3, 4.2, 'core'], ['cu', 0.035]], { t: 0.01, er: 3.3, tand: 0.02 });
    const t0 = performance.now();
    const r = analyze({ stackup: s, sel: sel('cu0', null, 'cu1'), line: { type: 'se', W: 0.02, etch: false }, q: 8 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
  it('makeGrid throws GeometryError above MAX_NODES', () => {
    const p = buildProblem(xsCu5(), { W: 0.135 }, 'se', 1);
    expect(() => makeGrid({ ...p, hmin: 1e-4, hmax: 1e-3, hmaxY: 1e-3 })).toThrow(GeometryError);
    expect(() => makeGrid({ ...p, hmin: 1e-4, hmax: 1e-3, hmaxY: 1e-3 })).toThrow(/too large/);
  });
  it('G 10 mm finishes or is refused', () => {
    const r = analyze({ stackup: outerB(), sel: sel('cu0', null, 'cu1'), line: { type: 'se', W: 0.2, G: 10, etch: false }, q: 1 });
    if (r.ok) expect(Number.isFinite(r.kind === 'se' ? r.r.Z0 : NaN)).toBe(true);
    else expect(r.error).toMatch(/too large/);
  }, 20_000);
  it('0.5 um copper finishes or is refused', () => {
    const s = stack([['cu', 0.0005, 'signal'], ['d', 0.12, 3.9], ['cu', 0.0005]]);
    const r = analyze({ stackup: s, sel: sel('cu0', null, 'cu1'), line: { type: 'se', W: 0.2, etch: true }, q: 1 });
    if (r.ok) expect(Number.isFinite(r.kind === 'se' ? r.r.Z0 : NaN)).toBe(true);
    else expect(r.error).toMatch(/too large/);
  }, 20_000);
  it('inner board sanity', () => {
    const r = analyze({ stackup: innerB(), sel: sel('cu2', 'cu1', 'cu3'), line: { type: 'se', W: 0.125, etch: false }, q: 1 });
    expect(r.ok && r.kind === 'se' && rel(r.r.Z0, 50.107) < 1e-3).toBe(true);
  });
});

// Pinned after measuring: the graded mesh keeps this case at ~72k nodes (q 4 grid), Z0 ≈ 216.8 Ω.
function PIN_NODE_CAP(r: ReturnType<typeof analyze>): void {
  expect(r.ok).toBe(true);
  if (r.ok && r.kind === 'se') {
    expect(r.r.nodes).toBeLessThan(MAX_NODES);
    expect(r.r.Z0).toBeGreaterThan(200);
    expect(r.r.Z0).toBeLessThan(235);
  }
}
