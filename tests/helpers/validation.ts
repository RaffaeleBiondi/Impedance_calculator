// Reference validations (spec §7): case definitions, computations and acceptance, shared by
// tests/solver/references.validation.test.ts and scripts/validation-report.ts so that the report and the
// assertions cannot diverge. Lengths in mm, impedances in ohm.
//
// Status rule (spec §5):
// - 'pass': an exact limit, the solver's own convergence, or the reference's stated accuracy is met;
// - 'deviation-recorded': the reference states no accuracy, or the result is outside it, AND an independent
//   second reference (pinned FD values below) agrees with the solver; the deviation is shown, not hidden;
// - 'not-validated': no reference exists (V15), or the feature is not there yet (V14 before Task 7).
// A check whose numbers fit none of these collects `failures`; the test fails and the report script throws.

import type { CrossSection, Slab, Topology } from '../../src/model/crossSection';
import { exampleStackup } from '../../src/model/example';
import type { Stackup } from '../../src/model/stackup';
import { analyze, makeBuild, richOrder } from '../../src/solver/engine';
import { analyzeDiff, analyzeSE, richDiff, richSE } from '../../src/solver/line';
import type { LineGeom } from '../../src/solver/problem';
import type { BuildFn, DiffResult, Mode, SEResult } from '../../src/solver/types';
import { legacy } from './legacy';
import {
  cohnCoupled, cohnStrip, cpwFinite, cpwg, cpwInfinite, embeddedMicrostrip, ETA0, hjMicrostrip, kjCoupledMicrostrip,
  offsetStripline,
} from './refs';
import { innerB, outerB, sel, stack, xsOf } from './stackups';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Status = 'pass' | 'deviation-recorded' | 'not-validated';
/** Row shape of src/validation.json (read by src/ui/Assumptions.tsx). */
export interface ValidationRow { id: string; test: string; reference: string; result: string; acceptance: string; status: Status }
export interface Check {
  row: ValidationRow;
  failures: string[]; // empty when the row is accepted under its status
  detail: string[]; // markdown lines for docs/validation.md (case tables)
  notes: string[]; // markdown paragraphs for docs/validation.md
}

// ---------------------------------------------------------------------------- formatting

export const pct = (a: number, b: number): number => (a / b - 1) * 100;
export const sp = (x: number, d = 3): string => `${Number(x.toFixed(d)) < 0 ? '−' : '+'}${Math.abs(x).toFixed(d)} %`;
const f = (x: number, d = 3): string => x.toFixed(d);
const range = (xs: number[], d = 3): string => {
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return Math.abs(hi - lo) < 0.5 * 10 ** -d ? sp(lo, d) : `${sp(lo, d)} … ${sp(hi, d)}`;
};
const maxAbs = (xs: number[]): number => Math.max(...xs.map(Math.abs));
const table = (head: string[], rows: (string | number)[][]): string[] => [
  `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`),
];

// ---------------------------------------------------------------------------- geometry

/**
 * Zero-thickness cross-sections for the closed-form references.
 *
 * Stripline and microstrip (and CPWG) go through the Stackup model (tests/helpers/stackups.ts) with T set to 0
 * afterwards: the model refuses copper of thickness 0, and with planes on every referenced side it produces
 * exactly the reference geometry.
 *
 * The open-side geometries (embedded microstrip, CPW without backside metal) are hand-built. On an open side the
 * model turns the far copper layer of a stackup into a 'cut out' slab of the neighbouring dielectric (0.035 mm
 * here), which is not part of the reference geometry: through the Stackup route it made the 1e-6 mm-cover
 * embedded line read −5.6 % against plain microstrip, and it thickened every CPW substrate.
 * xsMatchesModel() checks that the hand-built ones equal the model's output minus that slab.
 */
const t0 = (xs: CrossSection): CrossSection => ({ ...xs, T: 0 });
/** Stripline, trace H1 above the base plane and H2 below the cover plane, homogeneous er. */
export const xsStrip = (H1: number, H2: number, er: number): CrossSection =>
  t0(xsOf(stack([['cu', 0.035], ['d', H2, er], ['cu', 0.035, 'signal'], ['d', H1, er], ['cu', 0.035]]), sel('cu1', 'cu0', 'cu2')));
/** Microstrip (no mask), substrate H. With a coplanar G this is CPWG. */
export const xsMicro = (H: number, er: number): CrossSection =>
  t0(xsOf(stack([['cu', 0.035, 'signal'], ['d', H, er], ['cu', 0.035]]), sel('cu0', null, 'cu1')));

const slab = (t: number, er: number): Slab => ({ t, er, tand: 0, label: 'reference' });
function handXs(o: {
  base: Slab[]; cover?: Slab[]; outer: boolean; baseRef: boolean; coverRef?: boolean; fillEr?: number; topology: Topology;
}): CrossSection {
  return {
    T: 0, base: o.base, cover: o.cover ?? [], fill: o.fillEr != null ? { er: o.fillEr, tand: 0 } : null,
    outer: o.outer, coverMask: null, baseRef: o.baseRef, coverRef: o.coverRef ?? false,
    baseOpenMask: null, coverOpenMask: null, flipped: false, topology: o.topology, notes: [], warnings: [],
  };
}
/** Embedded microstrip: substrate H to the plane, cover Hc of the same er, then air (hand-built). */
export const xsEmbedded = (H: number, Hc: number, er: number): CrossSection => handXs({
  base: [slab(H, er)], cover: [slab(Hc, er)], outer: false, baseRef: true, coverRef: false, fillEr: er,
  topology: 'embedded-microstrip',
});
/** CPW without backside metal: substrate h, air below and above (hand-built). */
export const xsCpwOpen = (h: number, er: number): CrossSection =>
  handXs({ base: [slab(h, er)], outer: true, baseRef: false, topology: 'no-reference' });

/** The hand-built open-side cross-sections equal the model's, apart from the far copper's 'cut out' slab, T and labels. */
export function xsMatchesModel(): boolean {
  const dropCut = (a: Slab[]): Slab[] => a.filter((x) => !x.label.endsWith('(cut out)'));
  const norm = (x: CrossSection): string => JSON.stringify({
    ...x, T: 0, base: dropCut(x.base).map((s) => [s.t, s.er]), cover: dropCut(x.cover).map((s) => [s.t, s.er]),
    fill: x.fill && x.fill.er, notes: [], warnings: [],
  });
  const emb = xsOf(stack([['cu', 0.035], ['d', 0.05, 4.4], ['cu', 0.035, 'signal'], ['d', 0.1, 4.4], ['cu', 0.035]]), sel('cu1', null, 'cu2'));
  const cpw = xsOf(stack([['cu', 0.035, 'signal'], ['d', 0.2, 4.4], ['cu', 0.035]]), sel('cu0', null, null));
  return emb.cover.length === 2 && cpw.base.length === 2 // the slab really is there
    && norm(emb) === norm(xsEmbedded(0.1, 0.05, 4.4)) && norm(cpw) === norm(xsCpwOpen(0.2, 4.4));
}

export function se(xs: CrossSection, line: LineGeom, q: number, dom?: number): SEResult {
  const b = makeBuild(xs, line, dom);
  return richSE(b, q, b.order);
}
export function df(xs: CrossSection, line: LineGeom, q: number, dom?: number): DiffResult {
  const b = makeBuild(xs, line, dom);
  return richDiff(b, q, b.order);
}
/** Z (SE Z0 or Zdiff) at Richardson level q, or raw at mesh q. */
function zOf(xs: CrossSection, line: LineGeom, q: number, rich = true): number {
  const b = makeBuild(xs, line);
  const d = line.S != null;
  if (rich) return d ? richDiff(b, q, b.order).Zdiff : richSE(b, q, b.order).Z0;
  return d ? analyzeDiff(b, q).Zdiff : analyzeSE(b, q).Z0;
}

// ---------------------------------------------------------------------------- second reference (pinned FD)

/**
 * Independent second reference: a uniform-grid 5-point finite-difference Laplace solve (scipy sparse direct
 * solve; zero-thickness strips as Dirichlet nodes; cell-centred er; capacitance from the field energy; grounded
 * rectangular box), written independently by the reviewer of the reference formulas. The scripts are in
 * scripts/fd-reference/ (optional, Python with numpy and scipy); they are not part of the npm suite, so the
 * values are pinned here. Grid steps d = 0.01 / 0.005 / 0.0025 mm.
 * - Extrapolation to d → 0 (`fit`): from three grids where all three resolve the geometry (observed order
 *   0.97–1.0, used as measured); otherwise from the two grids that do, with order 1 assumed. At d = 0.01 mm
 *   some strip, slot or cover edges fall off the grid, and the next finer grid was not run.
 * - Box-size correction to an unbounded domain (`box`), for the open geometries, from measured box-size
 *   sequences (CPW without backside metal: box 3 → 6 → 12 mm gives +0.35 % then +0.09 % on Z; embedded:
 *   3×2 → 6×4 mm gives +0.15–0.16 % on Z and +0.20 % on εeff; CPWG: 3 → 6 mm gives +0.10–0.14 %).
 * - Estimated uncertainty: ±0.1 % (offset stripline), ±0.2 % (embedded), ±0.3 % (CPW, CPWG).
 */
const TWO = 'two grids, order 1 assumed';
export const FD = {
  offset: [
    { W: 0.2, H1: 0.1, H2: 0.3, er: 4.4, z: 39.536, raw: '38.697 / 39.112 / 39.322', fit: 'three grids, observed order 0.98', box: 'none (closed planes; side walls 1.5 mm away, not measured)' },
    { W: 0.1, H1: 0.1, H2: 0.3, er: 4, z: 60.103, raw: '58.138 / 59.101 / 59.592', fit: 'three grids, observed order 0.97', box: 'none (closed planes; side walls 1.5 mm away, not measured)' },
    { W: 0.2, H1: 0.1, H2: 0.2, er: 4, z: 39.128, raw: '38.266 / 38.696 / 38.912', fit: 'three grids, observed order 0.99', box: 'none (closed planes; side walls 1.5 mm away, not measured)' },
  ],
  embedded: [ // W 0.2, H 0.1, er 4.4
    { Hc: 0.025, z: 46.432, eeff: 3.6766, raw: 'box 3×2, d 0.005 / 0.0025: 45.865 / 46.100, εeff 3.6681 / 3.6674; box 6×4 at d 0.005: 45.936, εeff 3.6756', fit: `${TWO} (d 0.005 / 0.0025; at d 0.01 the cover interface falls off the cell-centred grid)`, box: '+0.21 % Z0, +0.27 % εeff' },
    { Hc: 0.05, z: 45.389, eeff: 3.8472, raw: 'box 3×2, d 0.01 / 0.005: 44.400 / 44.847, εeff 3.8364 / 3.8366', fit: `${TWO} (d 0.01 / 0.005; d 0.0025 not run)`, box: '+0.21 % Z0, +0.27 % εeff' },
    { Hc: 0.1, z: 44.234, eeff: 4.0511, raw: 'box 3×2, d 0.005 / 0.0025: 43.709 / 43.925, εeff 4.0390 / 4.0396; box 6×4 at d 0.005: 43.778, εeff 4.0469', fit: `${TWO} (d 0.005 / 0.0025; d 0.01 / 0.005 gives the same within 0.005 %)`, box: '+0.21 % Z0, +0.27 % εeff' },
    { Hc: 0.2, z: 43.278, eeff: 4.2315, raw: 'box 3×2, d 0.01 / 0.005: 42.347 / 42.767, εeff 4.2175 / 4.2188', fit: `${TWO} (d 0.01 / 0.005; d 0.0025 not run)`, box: '+0.21 % Z0, +0.27 % εeff' },
  ],
  cpwOpen: [
    { W: 0.2, G: 0.1, h: 0.2, er: 4.4, z: 76.20, eeff: 2.500, raw: 'box 3: 73.483 / 74.661 / 75.252, εeff 2.4948 / 2.4928 / 2.4917; box 6 / 12 at d 0.01: 73.740 / 73.804', fit: 'three grids, observed order 0.99', box: '+0.47 % Z0, +0.36 % εeff' },
    { W: 0.15, G: 0.15, h: 0.1, er: 4.4, z: 100.21, eeff: 2.158, raw: 'box 3, d 0.005 / 0.0025: 98.297 / 98.987, εeff 2.1520 / 2.1510; box 6 at d 0.005: 98.709, εeff 2.1576', fit: `${TWO} (d 0.005 / 0.0025; at d 0.01 the strip and slot edges fall off the grid)`, box: '+0.53 % Z0, +0.35 % εeff' },
  ],
  cpwg: [
    { W: 0.2, G: 0.1, h: 0.2, er: 4.4, z: 61.43, eeff: 2.913, raw: 'box 3: 59.625 / 60.476 / 60.902, εeff 2.9063 / 2.9076 / 2.9082; box 6 at d 0.01: 59.706, εeff 2.9102', fit: 'three grids, observed order 1.00', box: '+0.17 % Z0, +0.16 % εeff' },
    { W: 0.15, G: 0.15, h: 0.1, er: 4.4, z: 56.34, eeff: 3.1745, raw: 'box 3, d 0.005 / 0.0025: 55.478 / 55.872, εeff 3.1727 / 3.1713; box 6 at d 0.005: 55.532, εeff 3.1762', fit: `${TWO} (d 0.005 / 0.0025; at d 0.01 the strip and slot edges fall off the grid)`, box: '+0.13 % Z0, +0.14 % εeff' },
  ],
} as const;
/** Agreement required between the solver and the FD second reference to accept a recorded deviation. */
export const FD_TOL = 0.5; // %

// ---------------------------------------------------------------------------- V0, V2: port and legacy equivalence

const legacyBuilder = (g: any): BuildFn => (mode: Mode, q: number) => legacy.buildProblem({ ...g, S: mode === 'se' ? 0 : g.S }, mode, q);
const stripIn5 = { type: 'strip', T: 0.018, H1: 0.2, er1: 4.35, H2: 0.14, er2: 3.93, erf: 3.93, G: null, W: 0.135 };
const microF = { type: 'micro', T: 0.035, H: 0.12, er: 4.17, tm: 0.01, erm: 3.3, G: null, W: 0.2 };

export function v0(): Check {
  const cases: { name: string; g: any; kind: 'se' | 'diff' }[] = [
    { name: 'strip In5 SE', g: stripIn5, kind: 'se' },
    { name: 'micro F.Cu SE (mask)', g: microF, kind: 'se' },
    { name: 'micro F.Cu CPWG', g: { ...microF, G: 0.15 }, kind: 'se' },
    { name: 'micro T 0', g: { type: 'micro', T: 0, H: 0.12, er: 3.9, tm: 0, erm: 1, G: null, W: 0.12 }, kind: 'se' },
    { name: 'strip diff', g: { ...stripIn5, W: 0.125, S: 0.315 }, kind: 'diff' },
    { name: 'micro diff (mask)', g: { ...microF, W: 0.17, S: 0.27 }, kind: 'diff' },
    { name: 'micro diff CPWG (mask)', g: { ...microF, W: 0.21, S: 0.25, G: 0.3 }, kind: 'diff' },
  ];
  const rows: string[][] = [];
  let worst = 0;
  for (const c of cases) {
    const order = c.g.T > 0 ? 1.5 : 1;
    const keys = c.kind === 'se' ? ['Z0', 'eeff'] : ['Zodd', 'Zeven', 'eodd', 'eeven'];
    const ts: any = c.kind === 'se' ? richSE(legacyBuilder(c.g), 1, order) : richDiff(legacyBuilder(c.g), 1, order);
    const lg: any = c.kind === 'se' ? legacy.SE(c.g, 1) : legacy.DIFF(c.g, 1);
    const r = Math.max(...keys.map((k) => Math.abs(ts[k] / lg[k] - 1)));
    worst = Math.max(worst, r);
    rows.push([c.name, f(c.kind === 'se' ? ts.Z0 : ts.Zdiff, 4), r.toExponential(1)]);
  }
  return {
    row: {
      id: 'V0', test: 'Port golden: TS solver core vs the original JS (legacy problem descriptors)',
      reference: 'original solver (tests/legacy)', result: `max relative difference ${worst.toExponential(1)} (7 cases, q 1)`,
      acceptance: '≤ 1e-9 relative', status: 'pass',
    },
    failures: worst <= 1e-9 ? [] : [`V0 worst ${worst}`],
    detail: table(['Case', 'Z (Ω)', 'max rel. diff'], rows),
    notes: ['The fast suite (tests/solver/port.test.ts) also checks q 2, every result field, synthesis and the compact search.'],
  };
}

function exampleNoMask(): Stackup {
  const s = exampleStackup();
  s.maskTop = { t: 0, er: 3.3, tand: 0.02 };
  s.maskBottom = { t: 0, er: 3.3, tand: 0.02 };
  return s;
}

export function v2(): Check {
  const ex = exampleStackup(), nm = exampleNoMask();
  const gIn5 = { type: 'strip', T: 0.018, H1: 0.2, er1: 4.35, H2: 0.14, er2: 3.93, erf: 3.93 };
  const gF = { type: 'micro', T: 0.035, H: 0.12, er: 4.17, tm: 0, erm: 3.3 };
  const cu5 = (): CrossSection => xsOf(ex, sel('cu5', 'cu4', 'cu6'));
  const fcu = (): CrossSection => xsOf(nm, sel('cu0', null, 'cu1'));
  const cases: { name: string; xs: () => CrossSection; g: any; line: LineGeom }[] = [
    { name: 'In5 SE 0.135', xs: cu5, g: { ...gIn5, W: 0.135, G: null }, line: { W: 0.135 } },
    { name: 'In5 diff 0.125/0.315', xs: cu5, g: { ...gIn5, W: 0.125, S: 0.315, G: null }, line: { W: 0.125, S: 0.315 } },
    { name: 'In5 SE CPW G 0.2', xs: cu5, g: { ...gIn5, W: 0.135, G: 0.2 }, line: { W: 0.135, G: 0.2 } },
    { name: 'F.Cu no mask SE 0.20', xs: fcu, g: { ...gF, W: 0.2, G: null }, line: { W: 0.2 } },
    { name: 'F.Cu no mask diff 0.17/0.27', xs: fcu, g: { ...gF, W: 0.17, S: 0.27, G: null }, line: { W: 0.17, S: 0.27 } },
    { name: 'F.Cu no mask CPWG 0.20 G 0.15', xs: fcu, g: { ...gF, W: 0.2, G: 0.15 }, line: { W: 0.2, G: 0.15 } },
  ];
  const rows: string[][] = [];
  let worst = 0;
  for (const c of cases) {
    const order = richOrder(0.018);
    const lb = legacyBuilder(c.g);
    const zl = c.line.S != null ? richDiff(lb, 1, order).Zdiff : richSE(lb, 1, order).Z0;
    const zn = zOf(c.xs(), c.line, 1);
    const r = Math.abs(zn / zl - 1);
    worst = Math.max(worst, r);
    rows.push([c.name, f(zn, 4), r.toExponential(1)]);
  }
  return {
    row: {
      id: 'V2', test: 'Legacy equivalence: generalised builder vs legacy builder, unmasked legacy topologies',
      reference: 'legacy buildProblem', result: `max relative difference ${worst.toExponential(1)} (6 cases, q 1)`,
      acceptance: 'identical grid; ≤ 1e-9 relative', status: 'pass',
    },
    failures: worst <= 1e-9 ? [] : [`V2 worst ${worst}`],
    detail: table(['Case', 'Z (Ω)', 'rel. diff'], rows),
    notes: ['Grid identity (keys, fine points, steps, extents, every grid line) is asserted in the fast suite (tests/solver/problem.test.ts).'],
  };
}

// ---------------------------------------------------------------------------- V1: regression on the example stackup

/** V1 goldens (generalised builder, q 2 = rich(2,4)); legacy = original page. Never assert the rounded digit. */
export const V1_CASES: { name: string; layerId: string; refs: [string | null, string | null]; W: number; S?: number; z: number; legacy: number; masked: boolean }[] = [
  { name: 'In5 SE 0.135', layerId: 'cu5', refs: ['cu4', 'cu6'], W: 0.135, z: 50.0309, legacy: 50.03, masked: false },
  { name: 'In5 diff 0.125/0.315', layerId: 'cu5', refs: ['cu4', 'cu6'], W: 0.125, S: 0.315, z: 100.7861, legacy: 100.79, masked: false },
  { name: 'F.Cu SE 0.20', layerId: 'cu0', refs: [null, 'cu1'], W: 0.2, z: 50.3110, legacy: 50.36, masked: true },
  { name: 'F.Cu diff 0.17/0.27', layerId: 'cu0', refs: [null, 'cu1'], W: 0.17, S: 0.27, z: 100.7237, legacy: 100.78, masked: true },
  { name: 'F.Cu diff 0.21/0.25', layerId: 'cu0', refs: [null, 'cu1'], W: 0.21, S: 0.25, z: 90.1313, legacy: 90.18, masked: true },
];

export function v1(): Check {
  const ex = exampleStackup();
  const rows: string[][] = [];
  const failures: string[] = [];
  const zs: number[] = [];
  for (const c of V1_CASES) {
    const r = analyze({
      stackup: ex, sel: { layerId: c.layerId, refAbove: c.refs[0], refBelow: c.refs[1] },
      line: c.S === undefined ? { type: 'se', W: c.W, etch: false } : { type: 'diff', W: c.W, S: c.S, etch: false }, q: 2,
    });
    if (!r.ok) throw new Error(r.error);
    const z = r.kind === 'se' ? r.r.Z0 : r.r.Zdiff;
    zs.push(z);
    if (Math.abs(z - c.z) > 0.02) failures.push(`${c.name}: ${z} vs golden ${c.z}`);
    if (!c.masked && Math.abs(z - c.legacy) > 0.02) failures.push(`${c.name}: ${z} vs original page ${c.legacy}`);
    rows.push([c.name, c.masked ? 'yes' : 'no', f(c.legacy, 2), f(z, 3), c.masked ? sp(z - c.legacy, 3).replace(' %', ' Ω') : '—']);
  }
  return {
    row: {
      id: 'V1', test: 'Regression, example stackup, q 2 (five width-table cases)',
      reference: 'original page; re-baselined masked cases',
      result: `unmasked ${V1_CASES.map((c, i) => [c, zs[i]] as const).filter(([c]) => !c.masked).map(([, z]) => f(z)).join(' / ')} Ω (unchanged); ` +
        `masked ${V1_CASES.map((c, i) => [c, zs[i]] as const).filter(([c]) => c.masked).map(([c, z]) => `${f(c.legacy, 2)} → ${f(z)}`).join(', ')} Ω`,
      acceptance: 'unmasked ±0.02 Ω of the original; masked ±0.02 Ω of the new golden', status: 'pass',
    },
    failures,
    detail: table(['Case', 'Mask', 'Original page (Ω)', 'Now (Ω)', 'Shift'], rows),
    notes: [
      'The masked F.Cu values shift by about −0.1 % because the legacy builder left the solder-mask side walls off the grid (the wall moved with q and spoiled Richardson); the generalised builder keys them (spec §6.3, owner decision §5). Legacy → new: 50.36 → 50.311, 100.78 → 100.724, 90.18 → 90.131 Ω.',
    ],
  };
}

export function v1c(): Check {
  const ex = exampleStackup();
  const rows: string[][] = [];
  const ds: number[] = [];
  for (const c of V1_CASES.filter((x) => x.masked)) {
    const xs = xsOf(ex, sel(c.layerId, c.refs[0], c.refs[1]));
    const line = { W: c.W, S: c.S };
    const a = zOf(xs, line, 2), b = zOf(xs, line, 4);
    const d = pct(a, b);
    ds.push(d);
    rows.push([c.name, f(a, 4), f(b, 4), sp(d, 4)]);
  }
  const worst = maxAbs(ds);
  return {
    row: {
      id: 'V1c', test: 'V1 masked cases converged: rich(2,4) vs rich(4,8)',
      reference: 'self (mesh convergence)', result: `${range(ds, 4)}`,
      acceptance: '≤ 0.02 %', status: 'pass',
    },
    failures: worst <= 0.02 ? [] : [`V1c worst ${worst} %`],
    detail: table(['Case', 'rich(2,4) (Ω)', 'rich(4,8) (Ω)', 'Difference'], rows),
    notes: [],
  };
}

// ---------------------------------------------------------------------------- V3, V4, V5: legacy references, generalised builder

export function v3(): Check {
  const r = df(xsStrip(0.2, 0.2, 4), { W: 0.15, S: 0.25 }, 4);
  const ref = cohnCoupled(0.15, 0.25, 0.4, 4);
  const eo = pct(r.Zodd, ref.zoo), ee = pct(r.Zeven, ref.zoe);
  return {
    row: {
      id: 'V3', test: 'Coupled stripline: T 0, b 0.4, εr 4, W 0.15 / S 0.25, q 4',
      reference: 'Cohn (exact conformal map)', result: `Zodd ${sp(eo)}, Zeven ${sp(ee)}`,
      acceptance: '≤ 0.1 %', status: 'pass',
    },
    failures: Math.abs(eo) <= 0.1 && Math.abs(ee) <= 0.1 ? [] : [`V3 ${eo} / ${ee}`],
    detail: table(['Mode', 'Solver (Ω)', 'Cohn (Ω)', 'Error'], [
      ['odd', f(r.Zodd), f(ref.zoo), sp(eo)], ['even', f(r.Zeven), f(ref.zoe), sp(ee)],
    ]),
    notes: [
      `The conformal-map references (Cohn, CPW, CPWG) use the exact free-space impedance η0 = ${ETA0} Ω, consistent with the c0 and ε0 the solver uses. The original page quoted −0.05 / −0.06 % here with η0 = 120π (the usual 30π factor), which biases the reference by a constant +0.069 %; with η0 = 120π this solve reads Zodd ${sp(((1 + eo / 100) * ETA0 / (120 * Math.PI) - 1) * 100)}, Zeven ${sp(((1 + ee / 100) * ETA0 / (120 * Math.PI) - 1) * 100)}.`,
    ],
  };
}

export function v4(): Check {
  const rows: string[][] = [];
  const es: number[] = [];
  for (const W of [0.1, 0.2, 0.4]) {
    const z = se(xsStrip(0.2, 0.2, 4), { W }, 2).Z0, ref = cohnStrip(W, 0.4, 4);
    es.push(pct(z, ref));
    rows.push([f(W, 1), f(z, 4), f(ref, 4), sp(pct(z, ref))]);
  }
  return {
    row: {
      id: 'V4', test: 'Single stripline: T 0, b 0.4, εr 4, W 0.1 / 0.2 / 0.4, q 2',
      reference: 'Cohn (exact conformal map)', result: range(es), acceptance: '≤ 0.15 %', status: 'pass',
    },
    failures: maxAbs(es) <= 0.15 ? [] : [`V4 ${es}`],
    detail: table(['W', 'Solver (Ω)', 'Cohn (Ω)', 'Error'], rows),
    notes: [`Cohn with the exact η0 (see V3). With η0 = 120π, as in the figures quoted in the spec (−0.009 to −0.023 %), this solve reads ${range(es.map((e) => ((1 + e / 100) * ETA0 / (120 * Math.PI) - 1) * 100))}.`],
  };
}

export function v5(): Check {
  const H = 0.12, er = 3.9;
  const rows: string[][] = [];
  const es: number[] = [];
  for (const dom of [1, 2]) for (const u of [0.5, 1, 2]) {
    const z = se(xsMicro(H, er), { W: u * H }, 4, dom).Z0, ref = hjMicrostrip(u, er).z0;
    es.push(pct(z, ref));
    rows.push([String(dom), String(u), f(z), f(ref), sp(pct(z, ref))]);
  }
  return {
    row: {
      id: 'V5', test: 'Microstrip: T 0, no mask, H 0.12, εr 3.9, W/H 0.5 / 1 / 2, q 4, dom 1 and 2',
      reference: 'Hammerstad-Jensen (εeff ~0.2 %)', result: range(es), acceptance: '≤ 0.2 %', status: 'pass',
    },
    failures: maxAbs(es) <= 0.2 ? [] : [`V5 ${es}`],
    detail: table(['dom', 'W/H', 'Solver (Ω)', 'HJ (Ω)', 'Error'], rows),
    notes: ['HJ\'s own accuracy is about 0.2 %, so this shows agreement within the reference\'s accuracy, not 0.05 % solver accuracy.'],
  };
}

// ---------------------------------------------------------------------------- V6: coupled microstrip vs Kirschning-Jansen

export function v6(): Check {
  const H = 0.12, er = 3.9;
  const rows: string[][] = [];
  const ez: number[] = [], ee: number[] = [];
  for (const u of [0.5, 1, 2]) for (const g of [0.5, 1, 2]) {
    const r = df(xsMicro(H, er), { W: u * H, S: g * H }, 2);
    const k = kjCoupledMicrostrip(u * H, g * H, H, er);
    const a = pct(r.Zeven, k.zoe), b = pct(r.Zodd, k.zoo), c = pct(r.eeven, k.eeffEven), d = pct(r.eodd, k.eeffOdd);
    ez.push(a, b); ee.push(c, d);
    rows.push([String(u), String(g), f(r.Zeven), f(k.zoe), sp(a), f(r.Zodd), f(k.zoo), sp(b), sp(c), sp(d)]);
  }
  return {
    row: {
      id: 'V6', test: 'Coupled microstrip: T 0, no mask, H 0.12, εr 3.9, W/H and S/H 0.5 / 1 / 2, q 2',
      reference: 'Kirschning-Jansen (static Z < 0.6 %)', result: `Zeven, Zodd ${range(ez)} (εeff ${range(ee)})`,
      acceptance: '≤ 0.6 % (KJ stated accuracy)', status: 'pass',
    },
    failures: maxAbs(ez) <= 0.6 ? [] : [`V6 ${ez}`],
    detail: table(['W/H', 'S/H', 'Zeven', 'KJ', 'Error', 'Zodd', 'KJ', 'Error', 'εeff,e error', 'εeff,o error'], rows),
    notes: ['KJ states its accuracy for the static impedances; the εeff deviations are recorded, not part of the acceptance.'],
  };
}

// ---------------------------------------------------------------------------- V7, V13: convergence (case lists shared with the convergence test)

const ex = exampleStackup();
const oB = (): CrossSection => xsOf(outerB(), sel('cu0', null, 'cu1'));
const iB = (): CrossSection => xsOf(innerB(), sel('cu2', 'cu1', 'cu3'));
const trap35 = (W: number): number => W - 0.7 * 0.035;
const trap18 = (W: number): number => W - 0.7 * 0.018;
export interface ConvCase { name: string; xs: () => CrossSection; line: LineGeom }

/** V7: spec Appendix B legacy cases (legacy grid: +0.004 / −0.265 / +0.121 / +0.011 / −0.045 / −0.046 %) plus new topologies. */
export const V7_CASES: ConvCase[] = [
  { name: 'inner SE 0.125', xs: iB, line: { W: 0.125 } },
  { name: 'outer SE 0.22 (masked)', xs: oB, line: { W: 0.22 } },
  { name: 'outer CPWG 0.22 G 0.15', xs: oB, line: { W: 0.22, G: 0.15 } },
  { name: 'inner diff 0.125/0.2', xs: iB, line: { W: 0.125, S: 0.2 } },
  { name: 'outer diff 0.15/0.2', xs: oB, line: { W: 0.15, S: 0.2 } },
  { name: 'outer diff 0.3/0.18', xs: oB, line: { W: 0.3, S: 0.18 } },
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
export const V7_LEGACY: Record<string, number> = {
  'inner SE 0.125': 0.004, 'outer SE 0.22 (masked)': -0.265, 'outer CPWG 0.22 G 0.15': 0.121,
  'inner diff 0.125/0.2': 0.011, 'outer diff 0.15/0.2': -0.045, 'outer diff 0.3/0.18': -0.046,
};
/** rich(1,2) vs rich(2,4), percent. */
export function v7Delta(c: ConvCase): { a: number; b: number; d: number } {
  const xs = c.xs();
  const a = zOf(xs, c.line, 1), b = zOf(xs, c.line, 2);
  return { a, b, d: pct(a, b) };
}

export function v7(): Check {
  const rows: string[][] = [];
  const ds: number[] = [];
  let masked = NaN;
  for (const c of V7_CASES) {
    const r = v7Delta(c);
    ds.push(r.d);
    if (c.name === 'outer SE 0.22 (masked)') masked = r.d;
    rows.push([c.name, f(r.a), f(r.b), sp(r.d), c.name in V7_LEGACY ? sp(V7_LEGACY[c.name]) : '—']);
  }
  const failures = maxAbs(ds) <= 0.3 ? [] : [`V7 ${ds}`];
  if (!(Math.abs(masked) <= 0.02)) failures.push(`V7 masked outer SE ${masked} % (expected ~0.01 %)`);
  return {
    row: {
      id: 'V7', test: 'Mesh convergence rich(1,2) vs rich(2,4): six legacy cases plus every new topology (15 cases)',
      reference: 'self', result: `${range(ds)}; masked outer SE ${sp(masked)} (legacy grid −0.265 %)`,
      acceptance: '≤ 0.3 %; masked case ~0.01 %', status: 'pass',
    },
    failures,
    detail: table(['Case', 'rich(1,2) (Ω)', 'rich(2,4) (Ω)', 'Difference', 'Legacy grid'], rows),
    notes: [],
  };
}

export const V13_CASES: ConvCase[] = [
  { name: 'F.Cu SE 0.20 (masked)', xs: () => xsOf(ex, sel('cu0', null, 'cu1')), line: { W: 0.2, Wtop: trap35(0.2) } },
  { name: 'In5 SE 0.135', xs: () => xsOf(ex, sel('cu5', 'cu4', 'cu6')), line: { W: 0.135, Wtop: trap18(0.135) } },
  { name: 'F.Cu diff 0.17/0.27 (masked)', xs: () => xsOf(ex, sel('cu0', null, 'cu1')), line: { W: 0.17, S: 0.27, Wtop: trap35(0.17) } },
];
export const V13_OPEN: ConvCase[] = [
  { name: 'embedded microstrip (In2, ref In1)', xs: () => xsOf(ex, sel('cu2', 'cu1', null)), line: { W: 0.15 } },
  { name: 'CPW no ground (F.Cu)', xs: () => xsOf(ex, sel('cu0', null, null)), line: { W: 0.2, G: 0.15 } },
];
/** Observed three-mesh order p = log2((Z1 − Z2)/(Z2 − Z4)) from raw meshes q 1, 2, 4. */
export function observedOrder(c: ConvCase): number {
  const xs = c.xs();
  const [z1, z2, z4] = [1, 2, 4].map((q) => zOf(xs, c.line, q, false));
  return Math.log2((z1 - z2) / (z2 - z4));
}

export function v13(): Check {
  const rows: string[][] = [];
  const failures: string[] = [];
  const sls: number[] = [], ps: number[] = [];
  for (const c of V13_CASES) {
    const xs = c.xs();
    const W = c.line.W, Wtop = c.line.Wtop as number;
    const zRectW = zOf(xs, { ...c.line, Wtop: undefined }, 1), zRectTop = zOf(xs, { ...c.line, W: Wtop, Wtop: undefined }, 1);
    const zLim = zOf(xs, { ...c.line, Wtop: W }, 1);
    const z8 = zOf(xs, { ...c.line, slices: 8 }, 1), z16 = zOf(xs, { ...c.line, slices: 16 }, 1);
    const lim = Math.abs(zLim / zRectW - 1), sl = pct(z8, z16);
    const p = observedOrder(c), pr = observedOrder({ ...c, line: { ...c.line, Wtop: undefined } });
    sls.push(sl); ps.push(p);
    if (!(lim <= 1e-9)) failures.push(`${c.name}: W_top = W vs rectangle ${lim}`);
    if (!(zRectTop > z8 && z8 > zRectW)) failures.push(`${c.name}: trapezoid ${z8} not between ${zRectW} and ${zRectTop}`);
    if (!(Math.abs(sl) <= 0.1)) failures.push(`${c.name}: 8 vs 16 slices ${sl} %`);
    rows.push([c.name, lim.toExponential(1), `${f(zRectW)} < ${f(z8)} < ${f(zRectTop)}`, sp(sl, 4), f(p, 2), f(pr, 2)]);
  }
  const po = V13_OPEN.map((c) => [c.name, observedOrder(c)] as const);
  return {
    row: {
      id: 'V13', test: 'Trapezoid: limits, slices, observed mesh order (3 cases)',
      reference: 'limits and convergence',
      result: `W_top = W equals the rectangle; Z between rect(W) and rect(W_top); 8 vs 16 slices ${range(sls, 3)}; ` +
        `observed order ${f(Math.min(...ps), 2)}–${f(Math.max(...ps), 2)} (TRAP_ORDER 1.35)`,
      acceptance: '≤ 1e-9; between; ≤ 0.1 %; order recorded', status: 'pass',
    },
    failures,
    detail: [
      ...table(['Case', 'W_top = W vs rect', 'rect(W) < trap < rect(W_top) (Ω, q 1)', '8 vs 16 slices', 'order (trap)', 'order (rect)'], rows),
      '',
      ...table(['Open-boundary rectangle', 'observed order'], po.map(([n, p]) => [n, f(p, 2)])),
    ],
    notes: [
      'Richardson order for sliced trapezoids: `TRAP_ORDER` = 1.35 (src/solver/engine.ts). Measured three-mesh orders p = log2((Z1−Z2)/(Z2−Z4)) are 1.24–1.45 on ten trapezoid cases against 1.42–1.56 for rectangles; order 1.35 halves the worst rich(1,2) vs rich(2,4) spread compared with 1.5. Rectangles keep 1.5 with copper (1 at T = 0); open-boundary rectangles measure 1.50–1.56 and keep 1.5.',
    ],
  };
}

// ---------------------------------------------------------------------------- V8: homogeneous

export function v8(): Check {
  const er = 4;
  const strip4 = (): Stackup => stack([
    ['cu', 0.035, 'signal'], ['d', 0.12, er], ['cu', 0.035], ['d', 0.2, er, 'core'], ['cu', 0.018, 'signal'],
    ['d', 0.14, er], ['cu', 0.018, 'signal'], ['d', 0.2, er, 'core'], ['cu', 0.035], ['d', 0.12, er], ['cu', 0.035, 'signal'],
  ]);
  const cases: { name: string; xs: () => CrossSection; line: LineGeom }[] = [
    { name: 'asymmetric stripline SE', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu3')), line: { W: 0.15 } },
    { name: 'skip-layer stripline SE', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu4')), line: { W: 0.15 } },
    { name: 'skip-layer stripline diff', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu4')), line: { W: 0.12, S: 0.2 } },
    { name: 'CPW in stripline', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu3')), line: { W: 0.15, G: 0.12 } },
    { name: 'trapezoid stripline SE', xs: () => xsOf(strip4(), sel('cu2', 'cu1', 'cu3')), line: { W: 0.15, Wtop: 0.15 - 0.7 * 0.018 } },
  ];
  const rows: string[][] = [];
  let worst = 0;
  for (const c of cases) {
    const xs = c.xs();
    const es = c.line.S != null ? (() => { const r = df(xs, c.line, 1); return [r.eodd, r.eeven]; })() : [se(xs, c.line, 1).eeff];
    const r = Math.max(...es.map((e) => Math.abs(e / er - 1)));
    worst = Math.max(worst, r);
    rows.push([c.name, es.map((e) => f(e, 6)).join(' / '), r.toExponential(1)]);
  }
  return {
    row: {
      id: 'V8', test: 'Homogeneous cross-sections give εeff = εr (5 topologies)', reference: 'exact',
      result: `max relative error ${worst.toExponential(1)}`, acceptance: '≤ 1e-4 relative', status: 'pass',
    },
    failures: worst <= 1e-4 ? [] : [`V8 ${worst}`],
    detail: table(['Case', 'εeff', 'rel. error'], rows),
    notes: [],
  };
}

// ---------------------------------------------------------------------------- V9: asymmetric stripline

export function v9a(): Check {
  const rows: string[][] = [];
  const es: number[] = [];
  for (const [W, H, er] of [[0.1, 0.15, 3.9], [0.3, 0.15, 3.9], [0.2, 0.25, 4.4]]) {
    const z = se(xsStrip(H, H, er), { W }, 2).Z0, ref = cohnStrip(W, 2 * H, er);
    es.push(pct(z, ref));
    rows.push([f(W, 2), f(H, 2), f(H, 2), String(er), f(z, 4), f(ref, 4), sp(pct(z, ref))]);
  }
  return {
    row: {
      id: 'V9a', test: 'Asymmetric stripline, symmetric limit H1 = H2: T 0, homogeneous, q 2',
      reference: 'Cohn (exact)', result: range(es), acceptance: '≤ 0.15 %', status: 'pass',
    },
    failures: maxAbs(es) <= 0.15 ? [] : [`V9a ${es}`],
    detail: table(['W', 'H1', 'H2', 'εr', 'Solver (Ω)', 'Cohn (Ω)', 'Error'], rows),
    notes: [],
  };
}

export function v9b(): Check {
  const rows: string[][] = [];
  const failures: string[] = [];
  const ef: number[] = [], eF: number[] = [], fF: number[] = [];
  for (const c of FD.offset) {
    const z = se(xsStrip(c.H1, c.H2, c.er), { W: c.W }, 2).Z0;
    const ref = offsetStripline(c.W, c.H1, c.H2, c.er);
    const a = pct(z, ref), b = pct(z, c.z);
    ef.push(a); eF.push(b); fF.push(pct(ref, c.z));
    if (!(Math.abs(b) <= FD_TOL)) failures.push(`V9b W ${c.W} H1 ${c.H1} H2 ${c.H2}: solver vs FD ${b} %`);
    if (!(Math.abs(a) <= 4)) failures.push(`V9b W ${c.W}: formula deviation ${a} % outside the recorded band (≤ 4 %)`);
    rows.push([f(c.W, 2), f(c.H1, 2), f(c.H2, 2), String(c.er), f(z), f(ref), sp(a, 2), f(c.z), sp(b, 2), sp(pct(ref, c.z), 2)]);
  }
  return {
    row: {
      id: 'V9b', test: 'Asymmetric stripline H1 ≠ H2: T 0, homogeneous, q 2 (3 cases)',
      reference: 'uncorrected offset-stripline term 2·Z1·Z2/(Z1+Z2) (Wadell / IPC-2141A Z0,air without its ΔZ0,air correction; no accuracy published)',
      result: `solver vs formula ${range(ef, 2)}; solver vs independent FD ${range(eF, 2)}`,
      acceptance: 'uncorrected term: none stated, deviation recorded (band ≤ 4 %); FD second reference ≤ 0.5 %', status: 'deviation-recorded',
    },
    failures,
    detail: table(['W', 'H1', 'H2', 'εr', 'Solver (Ω)', 'Formula (Ω)', 'Solver vs formula', 'FD (Ω)', 'Solver vs FD', 'Formula vs FD'], rows),
    notes: [
      'Only the uncorrected term is compared: Z0 = 2·Z1·Z2/(Z1 + Z2), the parallel combination of two centred-stripline halves, which neglects the fringing coupling between them. The published Wadell / IPC-2141A formula adds a correction term ΔZ0,air for exactly that coupling, but its printed form could not be verified in an open source (the one reproduction found contains an evident typo), so it is left out (refs.ts). This row therefore records the error of the uncorrected term, not of the full published formula.',
      `The independent FD solve agrees with the solver within ${f(maxAbs(eF), 2)} % and puts the uncorrected term ${range(fF, 2)} high: ${FD.offset.map((c, i) => `${sp(fF[i], 2)} at W ${c.W}, H2/H1 = ${f(c.H2 / c.H1, 0)}`).join(', ')}. The error is larger at the stronger offset; at the same offset it is larger for the narrower trace. An independent image-Green's-function method-of-moments check by the reviewer (not pinned here) also agreed with the solver to about 0.05 %. The solver holds; the deviation is the uncorrected term's.`,
    ],
  };
}

// ---------------------------------------------------------------------------- V10: embedded microstrip

const EMB = { W: 0.2, H: 0.1, er: 4.4 };

export function v10a(): Check {
  const rows: string[][] = [];
  const es: number[] = [];
  for (const W of [0.1, 0.2]) {
    const zm = se(xsMicro(EMB.H, EMB.er), { W }, 2).Z0, ze = se(xsEmbedded(EMB.H, 1e-6, EMB.er), { W }, 2).Z0;
    es.push(pct(ze, zm));
    rows.push([f(W, 2), f(zm, 4), f(ze, 4), sp(pct(ze, zm), 4)]);
  }
  return {
    row: {
      id: 'V10a', test: 'Embedded microstrip, limit: cover 1e-6 mm vs plain microstrip (T 0, H 0.1, εr 4.4, q 2)',
      reference: 'limit (cover → 0 equals microstrip)', result: range(es, 4), acceptance: '≤ 0.1 %', status: 'pass',
    },
    failures: maxAbs(es) <= 0.1 ? [] : [`V10a ${es}`],
    detail: table(['W', 'Microstrip (Ω)', 'Embedded, cover 1e-6 (Ω)', 'Difference'], rows),
    notes: [],
  };
}

function embRows(): { Hc: number; r: SEResult; ref: { z0: number; eeff: number }; fd: { z: number; eeff: number; raw: string } }[] {
  return FD.embedded.map((fd) => ({
    Hc: fd.Hc, r: se(xsEmbedded(EMB.H, fd.Hc, EMB.er), { W: EMB.W }, 2), ref: embeddedMicrostrip(EMB.W, EMB.H, fd.Hc, EMB.er), fd,
  }));
}

export function v10b(rows = embRows()): Check {
  const ez = rows.map((x) => pct(x.r.Z0, x.ref.z0));
  const eF = rows.map((x) => pct(x.r.Z0, x.fd.z));
  return {
    row: {
      id: 'V10b', test: 'Embedded microstrip Z0, cover 0.025–0.2 mm (W 0.2, H 0.1, εr 4.4, T 0, q 2)',
      reference: 'Wadell / IPC-2141A embedded approximation ("estimated ±3 %" on Z0, quoted by the pcb-toolkit crate, a secondary source)',
      result: `solver vs formula ${range(ez, 2)}; solver vs independent FD ${range(eF, 2)}`, acceptance: '±3 %', status: 'pass',
    },
    failures: maxAbs(ez) <= 3 ? [] : [`V10b ${ez}`],
    detail: table(['Cover (mm)', 'Solver Z0 (Ω)', 'Formula (Ω)', 'Error', 'FD (Ω)', 'Solver vs FD'],
      rows.map((x, i) => [f(x.Hc, 3), f(x.r.Z0), f(x.ref.z0), sp(ez[i], 2), f(x.fd.z), sp(eF[i], 2)])),
    notes: [],
  };
}

export function v10c(rows = embRows()): Check {
  const ee = rows.map((x) => pct(x.r.eeff, x.ref.eeff));
  const eF = rows.map((x) => pct(x.r.eeff, x.fd.eeff));
  const failures: string[] = [];
  eF.forEach((e, i) => { if (!(Math.abs(e) <= FD_TOL)) failures.push(`V10c cover ${rows[i].Hc}: solver vs FD ${e} %`); });
  if (!(maxAbs(ee) <= 6)) failures.push(`V10c formula deviation ${ee} outside the recorded band (≤ 6 %)`);
  return {
    row: {
      id: 'V10c', test: 'Embedded microstrip εeff, cover 0.025–0.2 mm (same cases)',
      reference: 'Wadell / IPC-2141A embedded approximation (no εeff accuracy stated)',
      result: `solver vs formula ${range(ee, 2)}; solver vs independent FD ${range(eF, 2)}`,
      acceptance: 'formula: none stated, deviation recorded (band ≤ 6 %); FD second reference ≤ 0.5 %', status: 'deviation-recorded',
    },
    failures,
    detail: table(['Cover (mm)', 'Solver εeff', 'Formula', 'Error', 'FD', 'Solver vs FD'],
      rows.map((x, i) => [f(x.Hc, 3), f(x.r.eeff, 4), f(x.ref.eeff, 4), sp(ee[i], 2), f(x.fd.eeff, 4), sp(eF[i], 2)])),
    notes: [
      `The approximation only reweights the surface-microstrip εeff with exp(−2·Hc/H). Its Z0 stays within the ±3 % that a secondary source quotes, but its εeff reads ${range(rows.map((x) => pct(x.ref.eeff, x.fd.eeff)), 2)} against the FD (the review of the reference formulas found +5.4 % at Hc = H). The FD second reference agrees with the solver within ${f(Math.max(maxAbs(eF), maxAbs(rows.map((x) => pct(x.r.Z0, x.fd.z)))), 2)} % on both Z0 and εeff, so the solver holds and the deviation is the approximation's. Delay (√εeff) inherits half of it.`,
    ],
  };
}

// ---------------------------------------------------------------------------- V11: CPW without ground

export function v11(): Check {
  const W = 0.2, G = 0.1, er = 4, h = 20 * (W + 2 * G);
  const ref = cpwInfinite(W, G, er);
  const rs = [1, 2].map((dom) => ({ dom, r: se(xsCpwOpen(h, er), { W, G }, 2, dom) }));
  const ez = rs.map((x) => pct(x.r.Z0, ref.z0)), ee = rs.map((x) => pct(x.r.eeff, ref.eeff));
  return {
    row: {
      id: 'V11', test: `CPW without ground: substrate 20·(W+2G) = ${f(h, 1)} mm, T 0, W 0.2, G 0.1, εr 4, q 2, dom 1 and 2`,
      reference: 'exact conformal map (infinitely thick substrate)',
      result: `Z0 dom 1 ${sp(ez[0])}, dom 2 ${sp(ez[1])}; εeff dom 1 ${sp(ee[0])}, dom 2 ${sp(ee[1])}`,
      acceptance: 'Z0 ≤ 0.3 % at dom 1 and 2; εeff ≤ 0.3 % at dom 1 (shipped); dom 2 εeff band ≤ 1 %, accepted under the review ruling and deferred (known mesh-grading limitation)', status: 'pass',
    },
    failures: [
      ...(maxAbs(ez) <= 0.3 ? [] : [`V11 Z0 ${ez} %`]),
      ...(Math.abs(ee[0]) <= 0.3 ? [] : [`V11 εeff dom 1 ${ee[0]} %`]),
      ...(Math.abs(ee[1]) <= 1 ? [] : [`V11 εeff dom 2 ${ee[1]} % outside the recorded band`]),
    ],
    detail: table(['dom', 'Solver Z0 (Ω)', 'Exact (Ω)', 'Error', 'Solver εeff', 'Exact', 'Error', 'Nodes (finer mesh)'],
      rs.map((x, i) => [String(x.dom), f(x.r.Z0, 4), f(ref.z0, 4), sp(ez[i]), f(x.r.eeff, 4), f(ref.eeff, 4), sp(ee[i]), String(x.r.nodes)])),
    notes: [
      `The finite-substrate formula at h = ${f(h, 1)} mm differs from the infinite one by ${sp(pct(cpwFinite(W, G, h, er).z0, ref.z0), 4)}, so the substrate is thick enough.`,
      `Dom 1 vs 2 is driven by the mesh, not by the far boundary. With h = 8 mm the open-side air depth is D = 30·h = 240 mm (480 mm at dom 2), and the grid builder integrates its grading function with a fixed 200 samples per key interval, so the first cells next to the coplanar-ground edge and above the trace come out 14× (dom 1) and 27× (dom 2) larger than hmin. Measured when this check was set up: the raw meshes converge slowly (dom 1, q 1/2/4/8: 64.52 / 70.49 / 73.39 / 74.81 Ω) and Richardson carries the result (rich(2,4) 76.29, rich(4,8) 76.23 against an exact ${f(ref.z0, 3)} Ω). At dom 2 the observed order drops to about 0.84 and the order-1 Richardson overshoots, hence the larger dom 2 errors. Z0 passes at both. The dom 2 εeff error is accepted within a 1 % band under the review ruling and its fix is deferred: it is a known limitation of the mesh grading on very large open domains, not of the far boundary. The shipped analysis uses dom 1, and the convergence check V7 on the example stackup\'s CPW without ground passes.`,
    ],
  };
}

// ---------------------------------------------------------------------------- V12: CPW on a finite substrate, CPWG

const V12_CASES: [number, number, number, number][] = [[0.2, 0.1, 0.2, 4.4], [0.2, 0.15, 0.3, 4], [0.3, 0.1, 0.5, 3.9], [0.15, 0.15, 0.1, 4.4]];

function v12(kind: 'cpw' | 'cpwg'): Check {
  const id = kind === 'cpw' ? 'V12a' : 'V12b';
  const fds = kind === 'cpw' ? FD.cpwOpen : FD.cpwg;
  const rows: string[][] = [];
  const failures: string[] = [];
  const ez: number[] = [], ee: number[] = [];
  let deviation = false;
  const devs: string[] = [];
  const fdz: number[] = [];
  for (const [W, G, h, er] of V12_CASES) {
    const xs = kind === 'cpw' ? xsCpwOpen(h, er) : xsMicro(h, er);
    const r = se(xs, { W, G }, 2);
    const ref = kind === 'cpw' ? cpwFinite(W, G, h, er) : cpwg(W, G, h, er);
    const a = pct(r.Z0, ref.z0), b = pct(r.eeff, ref.eeff);
    ez.push(a); ee.push(b);
    const fd = fds.find((x) => x.W === W && x.G === G && x.h === h && x.er === er);
    const zF = fd ? pct(r.Z0, fd.z) : NaN, eF = fd ? pct(r.eeff, fd.eeff) : NaN;
    if (fd) fdz.push(zF);
    if (fd && !(Math.abs(zF) <= FD_TOL)) failures.push(`${id} ${W}/${G}/${h}: solver vs FD Z0 ${zF} %`);
    if (fd && !(Math.abs(eF) <= FD_TOL)) failures.push(`${id} ${W}/${G}/${h}: solver vs FD εeff ${eF} %`);
    if (Math.abs(a) > 1 || Math.abs(b) > 1) {
      if (!fd) failures.push(`${id} ${W}/${G}/${h}: Z0 ${a} % / εeff ${b} % beyond ~1 % with no second reference`);
      else {
        deviation = true;
        devs.push(`at W ${W}, G ${G}, h ${h} mm the formula reads ${sp(pct(ref.z0, fd.z), 2)} on Z0 and ${sp(pct(ref.eeff, fd.eeff), 2)} on εeff against the FD, which agrees with the solver within ${f(Math.max(Math.abs(zF), Math.abs(eF)), 2)} % on both`);
      }
    }
    rows.push([f(W, 2), f(G, 2), f(h, 2), String(er), f(r.Z0), f(ref.z0), sp(a, 2), sp(b, 2),
      fd ? f(fd.z, 2) : '—', fd ? sp(zF, 2) : '—', fd ? sp(eF, 2) : '—']);
  }
  const name = kind === 'cpw' ? 'CPW on a finite substrate (no backside metal)' : 'CPWG (conductor-backed CPW)';
  return {
    row: {
      id, test: `${name}: T 0, q 2 (4 cases, h 0.1–0.5 mm)`,
      reference: `${kind === 'cpw' ? 'Ghione / Veyres–Fouad Hanna' : 'Ghione-Naldi'} partial capacitance (Qucs, Simons; no accuracy stated)`,
      result: `solver vs formula: Z0 ${range(ez, 2)}, εeff ${range(ee, 2)}` + (fds.length ? `; solver vs independent FD ${range(fdz, 2)} (Z0, h ≤ 0.2 mm cases)` : ''),
      acceptance: '~1 % on Z0 and εeff (recorded); beyond it, FD second reference ≤ 0.5 %', status: deviation ? 'deviation-recorded' : 'pass',
    },
    failures,
    detail: table(['W', 'G', 'h', 'εr', 'Solver Z0 (Ω)', 'Formula (Ω)', 'Z0 error', 'εeff error', 'FD Z0 (Ω)', 'Solver vs FD (Z0)', 'Solver vs FD (εeff)'], rows),
    notes: [
      'The partial-capacitance formulas put magnetic walls along the slot edges inside the substrate and publish no accuracy; ' +
      'they degrade when the substrate is thin compared with the slots (h < W + 2G' + (kind === 'cpwg' ? '; with h < G the line is closer to a microstrip with side grounds' : '') + '). ' +
      (devs.length ? `Recorded: ${devs.join('; ')}. The solver holds; the deviation is the formula's.` : 'Every case is within ~1 %.'),
    ],
  };
}
export const v12a = (): Check => v12('cpw');
export const v12b = (): Check => v12('cpwg');

// ---------------------------------------------------------------------------- V14: dielectric loss (Task 7)

const C0 = 299792458;
const NP_DB = 20 / Math.LN10;
type LossFn = (s: Stackup, layer: string, refs: [string | null, string | null], W: number, fGHz: number) => { loss?: number; eeff: number };
const lossAt: LossFn = (s, layer, refs, W, fGHz) => {
  const r = analyze({ stackup: s, sel: { layerId: layer, refAbove: refs[0], refBelow: refs[1] }, line: { type: 'se', W, etch: false }, q: 2, freqGHz: fGHz });
  if (!r.ok || r.kind !== 'se') throw new Error(r.ok ? 'not SE' : r.error);
  return { loss: (r as { lossDbPerM?: number }).lossDbPerM, eeff: r.r.eeff };
};

export function v14(): Check {
  const er = 4, tand = 0.02, fGHz = 5;
  const withTand = (s: Stackup): Stackup => ({ ...s, layers: s.layers.map((l) => (l.kind === 'dielectric' ? { ...l, tand } : l)) });
  const strip = withTand(stack([['cu', 0.035], ['d', 0.2, er], ['cu', 0.018, 'signal'], ['d', 0.2, er], ['cu', 0.035]]));
  const probe = lossAt(strip, 'cu1', ['cu0', 'cu2'], 0.15, fGHz);
  if (probe.loss === undefined) {
    return {
      row: {
        id: 'V14', test: 'Dielectric loss', reference: 'exact homogeneous stripline; microstrip self-consistency identity',
        result: 'pending (Task 7)', acceptance: '≤ 0.1 % / ≤ 0.5 %', status: 'not-validated',
      },
      failures: [], detail: [], notes: ['AnalyzeResult.lossDbPerM is not populated on this branch; the row is computed when Task 7 is merged and the report is regenerated.'],
    };
  }
  // (a) homogeneous stripline: alpha_d = pi f sqrt(er) tand / c (Np/m)
  const exact = Math.PI * fGHz * 1e9 * Math.sqrt(er) * tand / C0 * NP_DB;
  const ea = pct(probe.loss, exact);
  // (b) single-dielectric microstrip: tand_eff = (er/eeff) d(eeff)/d(er) tand, so alpha = pi f sqrt(eeff) tand_eff / c
  const micro = (e: number): Stackup => withTand(stack([['cu', 0.035, 'signal'], ['d', 0.12, e], ['cu', 0.035]]));
  const m0 = lossAt(micro(er), 'cu0', [null, 'cu1'], 0.22, fGHz);
  const de = 0.01;
  const ep = lossAt(micro(er + de), 'cu0', [null, 'cu1'], 0.22, fGHz).eeff, em = lossAt(micro(er - de), 'cu0', [null, 'cu1'], 0.22, fGHz).eeff;
  const tandEff = (er / m0.eeff) * ((ep - em) / (2 * de)) * tand;
  const ident = Math.PI * fGHz * 1e9 * Math.sqrt(m0.eeff) * tandEff / C0 * NP_DB;
  const eb = pct(m0.loss as number, ident);
  const failures: string[] = [];
  if (!(Math.abs(ea) <= 0.1)) failures.push(`V14 stripline ${ea} %`);
  if (!(Math.abs(eb) <= 0.5)) failures.push(`V14 microstrip identity ${eb} %`);
  return {
    row: {
      id: 'V14', test: `Dielectric loss at ${fGHz} GHz, tanδ ${tand}: homogeneous stripline; microstrip (T 0.035, H 0.12, εr 4, W 0.22, no mask)`,
      reference: 'exact α = π f √εr tanδ / c; identity tanδeff = (εr/εeff)·∂εeff/∂εr·tanδ',
      result: `stripline ${sp(ea)}; microstrip identity ${sp(eb)}`, acceptance: '≤ 0.1 % / ≤ 0.5 %', status: 'pass',
    },
    failures,
    detail: table(['Case', 'Solver (dB/m)', 'Reference (dB/m)', 'Error'], [
      ['homogeneous stripline', f(probe.loss, 4), f(exact, 4), sp(ea)],
      ['microstrip identity', f(m0.loss as number, 4), f(ident, 4), sp(eb)],
    ]),
    notes: ['The identity uses a central difference of εeff over εr ± 0.01 of the single dielectric (no mask, so air is the only other material).'],
  };
}

// ---------------------------------------------------------------------------- V15: solder mask sensitivity

export function v15(): Check {
  const W = 0.22, q = 2;
  const micro = (t: number, er: number): Stackup => stack([['cu', 0.035, 'signal'], ['d', 0.12, 3.9], ['cu', 0.035]], { t, er, tand: 0.02 });
  const z = (t: number, er: number): number => zOf(xsOf(micro(t, er), sel('cu0', null, 'cu1')), { W }, q);
  const z0 = z(0, 1);
  const failures: string[] = [];
  const ts = [0, 0.005, 0.01, 0.02], ers = [3, 3.5, 4];
  const grid = ers.map((er) => ts.map((t) => (t === 0 ? z(0, er) : z(t, er))));
  grid.forEach((row, i) => {
    if (row[0] !== z0) failures.push(`t = 0, er ${ers[i]}: ${row[0]} differs from no mask ${z0}`);
    for (let j = 1; j < row.length; j++) if (!(row[j] < row[j - 1])) failures.push(`er ${ers[i]}: Z not decreasing at t ${ts[j]}`);
  });
  for (let j = 1; j < ts.length; j++) for (let i = 1; i < ers.length; i++) {
    if (!(grid[i][j] < grid[i - 1][j])) failures.push(`t ${ts[j]}: Z not decreasing at er ${ers[i]}`);
  }
  const dmax = pct(grid[2][3], z0);
  return {
    row: {
      id: 'V15', test: 'Solder mask (microstrip T 0.035, H 0.12, εr 3.9, W 0.22, q 2): t 0–20 µm, εr 3–4',
      reference: 'none exists: sensitivity only',
      result: `t = 0 reproduces no mask exactly; Z decreases monotonically in t and εr (down to ${sp(dmax, 2)} at 20 µm, εr 4)`,
      acceptance: 'recorded; not validated against a reference', status: 'not-validated',
    },
    failures,
    detail: table(['εr mask', ...ts.map((t) => `t ${f(t * 1000, 0)} µm (Ω)`)], grid.map((row, i) => [String(ers[i]), ...row.map((v) => f(v, 4))])),
    notes: ['Masked cases are converged per V7 (masked outer SE ~0.01 %) and V1c.'],
  };
}

// ---------------------------------------------------------------------------- V16: model and IO unit tests

export function v16(passed: number, total: number, files: number): Check {
  return {
    row: {
      id: 'V16', test: 'Model and IO: stackup validation, reference defaults, orientation, slabs, etch, units, JSON, URL hash, KiCad import, CSV',
      reference: '— (unit tests, tests/model and tests/io)', result: `${passed} / ${total} tests pass (${files} files)`,
      acceptance: 'unit tests', status: 'pass',
    },
    failures: passed === total && total > 0 ? [] : [`V16 ${passed} / ${total}`],
    detail: [], notes: [],
  };
}

/** Every computed row in report order (V16 is added by the report script, which runs the unit tests). */
export const CHECKS: [string, () => Check][] = [
  ['V0', v0], ['V1', v1], ['V1c', v1c], ['V2', v2], ['V3', v3], ['V4', v4], ['V5', v5], ['V6', v6], ['V7', v7], ['V8', v8],
  ['V9a', v9a], ['V9b', v9b], ['V10a', v10a], ['V10b', () => v10b()], ['V10c', () => v10c()], ['V11', v11],
  ['V12a', v12a], ['V12b', v12b], ['V13', v13], ['V14', v14], ['V15', v15],
];
