import { describe, expect, it } from 'vitest';
import { outerB, sel, xsOf } from '../helpers/stackups';
import { V13_CASES, V13_OPEN, V7_CASES } from '../helpers/validation';
import { exampleStackup } from '../../src/model/example';
import type { CrossSection } from '../../src/model/crossSection';
import { makeBuild } from '../../src/solver/engine';
import type { LineGeom } from '../../src/solver/problem';
import { analyzeDiff, analyzeSE, richDiff, richSE } from '../../src/solver/line';

/* eslint-disable no-console */
const ex = exampleStackup();
const oB = (): CrossSection => xsOf(outerB(), sel('cu0', null, 'cu1'));

function z(xs: CrossSection, line: LineGeom, q: number, rich = true): number {
  const b = makeBuild(xs, line);
  const d = line.S != null;
  if (rich) return d ? richDiff(b, q, b.order).Zdiff : richSE(b, q, b.order).Z0;
  return d ? analyzeDiff(b, q).Zdiff : analyzeSE(b, q).Z0;
}

describe('V7: mesh convergence rich(1,2) vs rich(2,4) ≤ 0.3 %', () => {
  const cases = V7_CASES;
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
  const cases = V13_CASES;
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
  for (const c of V13_OPEN) {
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
