import { describe, expect, it } from 'vitest';
import { exampleStackup } from '../../src/model/example';
import { analyze } from '../../src/solver/engine';

// V1: regression on the example stackup, generalised builder, q = 2 (Z = rich(2,4)).
// Values from `npx tsx scripts/baseline.ts`; each masked case is converged: rich(2,4) vs rich(4,8) ≤ 0.003 %.
// Never assert the rounded 1-decimal digit: assert ±0.02 Ω around the 4-decimal value.
const ex = exampleStackup();
const cases: { name: string; layerId: string; refs: [string | null, string | null]; W: number; S?: number; z: number; spec?: number }[] = [
  // unmasked stripline: must not change (legacy 50.03)
  { name: 'In5 SE 0.135', layerId: 'cu5', refs: ['cu4', 'cu6'], W: 0.135, z: 50.0309, spec: 50.03 },
  // unmasked stripline: must not change (legacy 100.79)
  { name: 'In5 diff 0.125/0.315', layerId: 'cu5', refs: ['cu4', 'cu6'], W: 0.125, S: 0.315, z: 100.7861, spec: 100.79 },
  // masked: legacy 50.36 (mask wall off the grid); keyed mask wall → 50.311
  { name: 'F.Cu SE 0.20', layerId: 'cu0', refs: [null, 'cu1'], W: 0.2, z: 50.3110 },
  // masked: legacy 100.78
  { name: 'F.Cu diff 0.17/0.27', layerId: 'cu0', refs: [null, 'cu1'], W: 0.17, S: 0.27, z: 100.7237 },
  // masked: legacy 90.18
  { name: 'F.Cu diff 0.21/0.25', layerId: 'cu0', refs: [null, 'cu1'], W: 0.21, S: 0.25, z: 90.1313 },
];

describe('V1: regression, example stackup, q = 2', () => {
  for (const c of cases) {
    it(c.name, () => {
      const r = analyze({
        stackup: ex, sel: { layerId: c.layerId, refAbove: c.refs[0], refBelow: c.refs[1] },
        line: c.S === undefined ? { type: 'se', W: c.W, etch: false } : { type: 'diff', W: c.W, S: c.S, etch: false }, q: 2,
      });
      if (!r.ok) throw new Error(r.error);
      const z = r.kind === 'se' ? r.r.Z0 : r.r.Zdiff;
      expect(Math.abs(z - c.z), `${c.name}: ${z}`).toBeLessThanOrEqual(0.02);
      if (c.spec !== undefined) expect(Math.abs(z - c.spec), `${c.name} vs spec ${c.spec}: ${z}`).toBeLessThanOrEqual(0.02);
    });
  }
});
