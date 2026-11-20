import { describe, expect, it } from 'vitest';
import {
  v1c, v3, v4, v5, v6, v9a, v9b, v10a, v10b, v10c, v11, v12a, v12b, v14, v15, xsMatchesModel, type Check, type Status,
} from '../helpers/validation';

// Reference validations for every geometry (spec §7). Case definitions, numbers and acceptance live in
// tests/helpers/validation.ts, shared with scripts/validation-report.ts (which writes docs/validation.md and
// src/validation.json). Each check must be accepted under the status pinned here: a row cannot silently move
// from 'pass' to 'deviation-recorded' (or back) without this file changing. V0, V2, V7, V8 and V13 are asserted
// in port.test.ts, problem.test.ts and convergence.validation.test.ts; V1 in regression.test.ts.

/* eslint-disable no-console */
const cases: [string, () => Check, Status][] = [
  ['V1c masked V1 cases converged, rich(2,4) vs rich(4,8) ≤ 0.02 %', v1c, 'pass'],
  ['V3 coupled stripline vs Cohn (generalised builder)', v3, 'pass'],
  ['V4 single stripline vs Cohn ≤ 0.15 %', v4, 'pass'],
  ['V5 microstrip vs Hammerstad-Jensen (generalised builder)', v5, 'pass'],
  ['V6 coupled microstrip vs Kirschning-Jansen ≤ 0.6 %', v6, 'pass'],
  ['V9a asymmetric stripline, H1 = H2 limit vs Cohn ≤ 0.15 %', v9a, 'pass'],
  ['V9b asymmetric stripline vs offset formula (deviation, FD-backed)', v9b, 'deviation-recorded'],
  ['V10a embedded microstrip, cover 1e-6 equals microstrip ≤ 0.1 %', v10a, 'pass'],
  ['V10b embedded microstrip Z0 within ±3 %', () => v10b(), 'pass'],
  ['V10c embedded microstrip εeff (deviation, FD-backed)', () => v10c(), 'deviation-recorded'],
  ['V11 CPW without ground vs exact conformal map ≤ 0.3 %, dom 1 and 2', v11, 'pass'],
  ['V12a CPW on a finite substrate (~1 %, deviation FD-backed)', v12a, 'deviation-recorded'],
  ['V12b CPWG (~1 %, deviation FD-backed)', v12b, 'deviation-recorded'],
  ['V15 solder mask: t = 0 exact, monotonic in t and εr', v15, 'not-validated'],
];

describe('reference validations', () => {
  it('hand-built T = 0 cross-sections equal the model\'s where planes bound the referenced sides', () => {
    expect(xsMatchesModel()).toBe(true);
  });
  for (const [name, fn, status] of cases) {
    it(name, () => {
      const c = fn();
      console.log(`${c.row.id} [${c.row.status}] ${c.row.result}`);
      expect(c.failures).toEqual([]);
      expect(c.row.status).toBe(status);
    }, 120_000);
  }
  it('V14 dielectric loss: exact stripline and microstrip identity, or not validated before Task 7', () => {
    const c = v14();
    console.log(`${c.row.id} [${c.row.status}] ${c.row.result}`);
    expect(c.failures).toEqual([]);
    expect(c.row.status === 'pass' || (c.row.status === 'not-validated' && c.row.result === 'pending (Task 7)')).toBe(true);
  }, 120_000);
});
