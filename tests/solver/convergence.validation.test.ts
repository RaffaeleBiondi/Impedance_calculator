import { describe, expect, it } from 'vitest';
import { innerB, outerB, sel, xsOf } from '../helpers/stackups';
import { exampleStackup } from '../../src/model/example';
import type { CrossSection } from '../../src/model/crossSection';
import { makeBuild } from '../../src/solver/engine';
import type { LineGeom } from '../../src/solver/problem';
import { analyzeDiff, analyzeSE, richDiff, richSE } from '../../src/solver/line';

/* eslint-disable no-console */
const ex = exampleStackup();
const oB = (): CrossSection => xsOf(outerB(), sel('cu0', null, 'cu1'));
const iB = (): CrossSection => xsOf(innerB(), sel('cu2', 'cu1', 'cu3'));
const trap35 = (W: number): number => W - 0.7 * 0.035;
const trap18 = (W: number): number => W - 0.7 * 0.018;

function z(xs: CrossSection, line: LineGeom, q: number, rich = true): number {
  const b = makeBuild(xs, line);
  const d = line.S != null;
  if (rich) return d ? richDiff(b, q, b.order).Zdiff : richSE(b, q, b.order).Z0;
  return d ? analyzeDiff(b, q).Zdiff : analyzeSE(b, q).Z0;
}

describe('V7: mesh convergence rich(1,2) vs rich(2,4) ≤ 0.3 %', () => {
  const cases: { name: string; xs: () => CrossSection; line: LineGeom }[] = [
    // spec Appendix B (legacy grid: +0.004 / -0.265 / +0.121 / +0.011 / -0.045 / -0.046 %)
    { name: 'inner SE 0.125', xs: iB, line: { W: 0.125 } },
    { name: 'outer SE 0.22 (masked)', xs: oB, line: { W: 0.22 } },
    { name: 'outer CPWG 0.22 G 0.15', xs: oB, line: { W: 0.22, G: 0.15 } },
    { name: 'inner diff 0.125/0.2', xs: iB, line: { W: 0.125, S: 0.2 } },
    { name: 'outer diff 0.15/0.2', xs: oB, line: { W: 0.15, S: 0.2 } },
    { name: 'outer diff 0.3/0.18', xs: oB, line: { W: 0.3, S: 0.18 } },
    // new topologies
    { name: 'embedded microstrip (In2, ref In1)', xs: () => xsOf(ex, sel('cu2', 'cu1', null)), line: { W: 0.15 } },
    { name: 'embedded, open base (In2, ref In3)', xs: () => xsOf(ex, sel('cu2', null, 'cu3')), line: { W: 0.15 } },
    { name: 'skip-layer stripline (In5, In3/In6)', xs: () => xsOf(ex, sel('cu5', 'cu3', 'cu6')), line: { W: 0.15 } },
    { name: 'CPW no ground (F.Cu)', xs: () => xsOf(ex, sel('cu0', null, null)), line: { W: 0.2, G: 0.15 } },
    { name: 'CPWG stripline (In5)', xs: () => xsOf(ex, sel('cu5', 'cu4', 'cu6')), line: { W: 0.135, G: 0.15 } },
    { name: 'trapezoid SE (In5)', xs: () => xsOf(ex, sel('cu5', 'cu4', 'cu6')), line: { W: 0.135, Wtop: trap18(0.135) } },
    { name: 'trapezoid diff (In5)', xs: () => xsOf(ex, sel('cu5', 'cu4', 'cu6')), line: { W: 0.125, S: 0.315, Wtop: trap18(0.125) } },
    { name: 'masked trapezoid SE (F.Cu)', xs: () => xsOf(ex, sel('cu0', null, 'cu1')), line: { W: 0.2, Wtop: trap35(0.2) } },
    { name: 'masked trapezoid diff + G (F.Cu)', xs: () => xsOf(ex, sel('cu0', null, 'cu1')), line: { W: 0.17, S: 0.27, G: 0.2, Wtop: trap35(0.17) } },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const xs = c.xs();
      const a = z(xs, c.line, 1), b = z(xs, c.line, 2);
      const d = (a / b - 1) * 100;
      console.log(`V7 ${c.name.padEnd(36)} ${a.toFixed(3)} ${b.toFixed(3)} ${d >= 0 ? '+' : ''}${d.toFixed(3)} %`);
      expect(Math.abs(d)).toBeLessThanOrEqual(0.3);
    }, 60_000);
  }
  it('masked outer SE 0.22 drops to ~0.01 % with keyed mask walls', () => {
    const xs = oB();
    const a = z(xs, { W: 0.22 }, 1), b = z(xs, { W: 0.22 }, 2);
    expect(Math.abs(a / b - 1)).toBeLessThanOrEqual(2e-4);
  }, 60_000);
});

describe('V13: trapezoid slices and observed mesh order', () => {
  const cases: { name: string; xs: () => CrossSection; line: LineGeom }[] = [
    { name: 'F.Cu SE 0.20 (masked)', xs: () => xsOf(ex, sel('cu0', null, 'cu1')), line: { W: 0.2, Wtop: trap35(0.2) } },
    { name: 'In5 SE 0.135', xs: () => xsOf(ex, sel('cu5', 'cu4', 'cu6')), line: { W: 0.135, Wtop: trap18(0.135) } },
    { name: 'F.Cu diff 0.17/0.27 (masked)', xs: () => xsOf(ex, sel('cu0', null, 'cu1')), line: { W: 0.17, S: 0.27, Wtop: trap35(0.17) } },
  ];
  for (const c of cases) {
    it(`${c.name}: 8 vs 16 slices ≤ 0.1 %`, () => {
      const xs = c.xs();
      const z8 = z(xs, { ...c.line, slices: 8 }, 1), z16 = z(xs, { ...c.line, slices: 16 }, 1);
      const d = (z8 / z16 - 1) * 100;
      console.log(`V13 slices ${c.name.padEnd(30)} 8: ${z8.toFixed(4)} 16: ${z16.toFixed(4)} ${d.toFixed(4)} %`);
      expect(Math.abs(d)).toBeLessThanOrEqual(0.1);
    }, 60_000);
    it(`${c.name}: observed order from meshes q 1, 2, 4`, () => {
      const xs = c.xs();
      const [z1, z2, z4] = [1, 2, 4].map((q) => z(xs, c.line, q, false));
      const rect = { ...c.line, Wtop: undefined };
      const [r1, r2, r4] = [1, 2, 4].map((q) => z(xs, rect, q, false));
      const p = Math.log2((z1 - z2) / (z2 - z4)), pr = Math.log2((r1 - r2) / (r2 - r4));
      console.log(`V13 order  ${c.name.padEnd(30)} trapezoid p = ${p.toFixed(3)}  rectangle p = ${pr.toFixed(3)}`);
      // Recorded: trapezoids 1.24–1.45 (TRAP_ORDER 1.35), rectangles 1.42–1.56 (order 1.5).
      expect(p).toBeGreaterThan(1.2);
      expect(p).toBeLessThan(1.5);
      expect(pr).toBeGreaterThan(1.4);
      expect(pr).toBeLessThan(1.6);
    }, 60_000);
  }
  for (const c of [
    { name: 'embedded microstrip (In2, ref In1)', xs: () => xsOf(ex, sel('cu2', 'cu1', null)), line: { W: 0.15 } },
    { name: 'CPW no ground (F.Cu)', xs: () => xsOf(ex, sel('cu0', null, null)), line: { W: 0.2, G: 0.15 } },
  ]) {
    it(`open boundary, ${c.name}: observed order stays at 1.5`, () => {
      const xs = c.xs();
      const [z1, z2, z4] = [1, 2, 4].map((q) => z(xs, c.line, q, false));
      const p = Math.log2((z1 - z2) / (z2 - z4));
      console.log(`V13 order  open ${c.name.padEnd(30)} rectangle p = ${p.toFixed(3)}`);
      expect(p).toBeGreaterThan(1.4);
      expect(p).toBeLessThan(1.6);
    }, 60_000);
  }
  it('CPW no ground: domain size dom 1 vs 2 (recorded)', () => {
    const xs = xsOf(ex, sel('cu0', null, null));
    const line = { W: 0.2, G: 0.15 };
    const b1 = makeBuild(xs, line, 1), b2 = makeBuild(xs, line, 2);
    const z1 = richSE(b1, 1, b1.order).Z0, z2 = richSE(b2, 1, b2.order).Z0;
    console.log(`V7 CPW no ground dom 1: ${z1.toFixed(3)}  dom 2: ${z2.toFixed(3)}  ${((z1 / z2 - 1) * 100).toFixed(3)} %`);
    expect(Math.abs(z1 / z2 - 1)).toBeLessThan(0.01);
  }, 60_000);
});
