import { describe, expect, it } from 'vitest';
import { exampleStackup } from '../../src/model/example';
import { analyze } from '../../src/solver/engine';
import { V1_CASES } from '../helpers/validation';

// V1: regression on the example stackup, generalised builder, q = 2 (Z = rich(2,4)).
// Values from `npx tsx scripts/baseline.ts`; each masked case is converged: rich(2,4) vs rich(4,8) ≤ 0.003 %.
// Never assert the rounded 1-decimal digit: assert ±0.02 Ω around the 4-decimal value.
const ex = exampleStackup();
// Goldens and original-page values live in tests/helpers/validation.ts (V1_CASES), shared with the report.
const cases = V1_CASES.map((c) => ({ ...c, spec: c.masked ? undefined : c.legacy }));

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
