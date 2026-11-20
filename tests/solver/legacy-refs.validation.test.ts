import { describe, expect, it } from 'vitest';
import { legacy } from '../helpers/legacy';
import { cohnCoupled, hjMicrostrip } from '../helpers/refs';
import { richDiff, richSE } from '../../src/solver/line';
import type { BuildFn, Mode } from '../../src/solver/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const builder = (g: any): BuildFn => (mode: Mode, q: number) =>
  legacy.buildProblem({ ...g, S: mode === 'se' ? 0 : g.S }, mode, q);

describe('V3: coupled stripline vs Cohn', () => {
  // Cohn now uses the exact eta0 (refs.ts ETA0); the original page's −0.05 / −0.06 % used eta0 = 120π.
  it('Zodd and Zeven errors lie within ±0.1 %', () => {
    const g = { type: 'strip', T: 0, H1: 0.2, er1: 4, H2: 0.2, er2: 4, erf: 4, G: null, W: 0.15, S: 0.25 };
    const r = richDiff(builder(g), 4, 1);
    const ref = cohnCoupled(0.15, 0.25, 0.4, 4);
    const eo = r.Zodd / ref.zoo - 1, ee = r.Zeven / ref.zoe - 1;
    expect(Math.abs(eo)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(ee)).toBeLessThanOrEqual(0.001);
  });
});

describe('V5: microstrip vs Hammerstad-Jensen', () => {
  // Spec Appendix B: [dom, u, FD, HJ]
  const rows: [number, number, number, number][] = [
    [1, 0.5, 100.440, 100.513], [1, 1, 74.822, 74.870], [1, 2, 51.349, 51.387],
    [2, 0.5, 100.465, 100.513], [2, 1, 74.846, 74.870], [2, 2, 51.374, 51.387],
  ];
  for (const [dom, u, fd, hj] of rows) {
    it(`dom ${dom}, u ${u}`, () => {
      const H = 0.12;
      const g = { type: 'micro', T: 0, H, er: 3.9, tm: 0, erm: 1, G: null, W: u * H, dom };
      const z = richSE(builder(g), 4, 1).Z0;
      const ref = hjMicrostrip(u, 3.9).z0;
      expect(Math.abs(z / ref - 1)).toBeLessThanOrEqual(0.002);
      expect(z).toBeCloseTo(fd, 3);
      expect(ref).toBeCloseTo(hj, 3);
    });
  }
});
