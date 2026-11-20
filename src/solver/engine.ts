import { buildCrossSection, type CrossSection, type Selection } from '../model/crossSection';
import { etchReduction, validateStackup, type Stackup } from '../model/stackup';
import { GeometryError, makeGrid } from './grid';
import { richDiff, richSE } from './line';
import { buildProblem, isTrapezoid, type LineGeom } from './problem';
import type { BuildFn, DiffResult, SEResult } from './types';

export interface LineSpec { type: 'se' | 'diff'; W: number; S?: number; G?: number | null; etch: boolean }
export interface AnalyzeRequest { stackup: Stackup; sel: Selection; line: LineSpec; q: number; freqGHz?: number }
export type AnalyzeResult =
  | { ok: true; kind: 'se'; r: SEResult; xs: CrossSection; wtop?: number; lossDbPerM?: number }
  | { ok: true; kind: 'diff'; r: DiffResult; oddOnly: boolean; xs: CrossSection; wtop?: number; lossDbPerM?: number }
  | { ok: false; error: string };

export const NO_REFERENCE_SE = 'No reference: single-ended needs a plane or coplanar GND';

/**
 * Observed Richardson order of sliced trapezoids (V13). Three-mesh orders p = log2((Z1−Z2)/(Z2−Z4)) on ten
 * trapezoid cases (micro/strip/embedded/CPW/CPWG, SE and diff, masked and not, 18 and 35 µm copper, 8 slices)
 * fall in 1.24–1.45 (rectangles: 1.42–1.56). Order 1.35 halves the worst rich(1,2) vs rich(2,4) and
 * rich(2,4) vs rich(4,8) spreads compared with 1.5 (0.024 % / 0.007 % against 0.052 % / 0.014 %).
 * The slice keys pin the mesh near the sidewall independently of q, so the mesh does not refine uniformly.
 * Calibrated at the default 8 slices (16 slices gave an erratic 1.68 / 1.13 on F.Cu SE); applied to any count.
 * Open-boundary rectangles (embedded microstrip, CPW without ground) measure 1.50–1.56 and keep 1.5.
 */
export const TRAP_ORDER = 1.35;

/**
 * Richardson exponent: 1.5 with thick copper (corner singularity), 1 for zero thickness (legacy rule),
 * TRAP_ORDER for a real trapezoid.
 */
export function richOrder(T: number, trapezoid = false): number {
  return T > 0 ? (trapezoid ? TRAP_ORDER : 1.5) : 1;
}

/** Solver build function (mode, q) → Problem for a fixed cross-section and line, carrying its Richardson order. */
export function makeBuild(xs: CrossSection, line: LineGeom, dom?: number): BuildFn & { order: number } {
  const build: BuildFn = (mode, q) => buildProblem(xs, line, mode, q, { dom });
  return Object.assign(build, { order: richOrder(xs.T, isTrapezoid(xs.T, line)) });
}

const pos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function analyze(req: AnalyzeRequest): AnalyzeResult {
  const errors = validateStackup(req.stackup).filter((i) => i.level === 'error');
  if (errors.length) return { ok: false, error: `Invalid stackup: ${errors[0].msg}` };
  const cs = buildCrossSection(req.stackup, req.sel);
  if (!cs.ok) return { ok: false, error: cs.error };
  const xs = cs.xs;
  const L = req.line;
  if (!pos(L.W)) return { ok: false, error: 'Width W must be a number > 0' };
  if (L.type === 'diff' && !pos(L.S)) return { ok: false, error: 'Gap S must be a number > 0' };
  if (L.G != null && !pos(L.G)) return { ok: false, error: 'Coplanar gap G must be a number > 0 (or off)' };
  const hasG = L.G != null;

  let wtop: number | undefined;
  if (L.etch) {
    wtop = L.W - etchReduction(req.stackup, req.sel.layerId);
    if (!(wtop > 0)) {
      return { ok: false, error: `Etched top width W_top = ${wtop.toFixed(4)} mm is not positive: widen the trace or check the etch rule` };
    }
  }

  const oddOnly = xs.topology === 'no-reference' && !hasG;
  if (oddOnly && L.type === 'se') return { ok: false, error: NO_REFERENCE_SE };

  const geom: LineGeom = { W: L.W, S: L.type === 'diff' ? L.S : undefined, G: hasG ? L.G : null, Wtop: wtop };
  const build = makeBuild(xs, geom);
  const order = build.order;
  try {
    // Refuse oversize meshes before any solve: the finer (2q) grid of the Richardson pair is the largest.
    for (const mode of L.type === 'se' ? (['se'] as const) : (['odd', 'even'] as const)) makeGrid(build(mode, 2 * (req.q || 1)));
    if (L.type === 'se') return { ok: true, kind: 'se', r: richSE(build, req.q, order), xs, wtop };
    return { ok: true, kind: 'diff', r: richDiff(build, req.q, order), oddOnly, xs, wtop };
  } catch (e) {
    if (e instanceof GeometryError) return { ok: false, error: e.message };
    throw e;
  }
}
