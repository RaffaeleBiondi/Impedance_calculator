import type { CrossSection } from '../model/crossSection';
import type { CondRect, DielRect, Mode, Problem } from './types';

export { GeometryError, MAX_NODES } from './grid';

/**
 * Line geometry in the cross-section (mm). W, S and G are measured at the trace base.
 * Wtop undefined (or equal to W) = rectangular trace; otherwise a trapezoid of `slices` slices (default 8).
 */
export interface LineGeom { W: number; S?: number; G?: number | null; Wtop?: number; slices?: number }

export const DEFAULT_SLICES = 8;
const EPS = 1e-9;

/** True when the line is a real trapezoid (T > 0 and W_top ≠ W); otherwise it is solved as one rectangle. */
export function isTrapezoid(T: number, line: LineGeom): boolean {
  return T > 0 && line.Wtop != null && Math.abs(line.W - line.Wtop) > 1e-12;
}

/** One horizontal slice of the trace (and of the coplanar GND edge): x span in the half domain. */
interface Slice { y0: number; y1: number; xa: number; xb: number; xg: number | null }

/**
 * Turn a cross-section plus a line geometry into the solver's Problem (half domain, symmetry wall at x = 0).
 *
 * y points away from the base dielectric. From y = 0 upward:
 * - base side: the base reference plane at y = 0, or (open base) air of depth D on a grounded far boundary,
 *   then the open-side mask, then the base slabs (outermost first);
 * - the trace layer (inner: cover-side fill; outer: air plus conformal mask);
 * - cover side: cover slabs up to the cover plane at ymax, or (open cover) the open-side mask and air of depth D
 *   up to a grounded far boundary. D = dom · max(30·H, 6·W), H = distance to the reference (base side when present).
 *
 * Legacy-shaped cross-sections (outer with one base slab and a base plane; inner with one slab per side and both
 * planes) reproduce the legacy `buildProblem` keys, fines, steps and extents exactly. Mask walls, trapezoid slice
 * edges and tapered coplanar-GND edges get their own x keys and fine points, so every material and conductor edge
 * sits on a grid line.
 */
export function buildProblem(xs: CrossSection, line: LineGeom, mode: Mode, q: number, opts: { dom?: number } = {}): Problem {
  q = q || 1;
  const dom = opts.dom || 1;
  const T = Math.max(0, xs.T), W = line.W;
  const diff = mode !== 'se';
  const S = diff ? (line.S as number) : 0;
  const xa = diff ? S / 2 : 0, xb = diff ? S / 2 + W : W / 2; // trace span in the half domain (at the base)
  const G = line.G;
  const hasG = G != null && G > 0;
  const xg = hasG ? xb + (G as number) : null;

  const sum = (a: { t: number }[]): number => a.reduce((s, x) => s + x.t, 0);
  const Hb = sum(xs.base), Hc = sum(xs.cover);
  const closed = xs.baseRef && xs.coverRef;
  // Reference distance: legacy strip uses min(H1, H2), legacy micro uses H (the base slab).
  const Href = closed ? Math.min(Hb, Hc) : xs.baseRef ? Hb : xs.coverRef ? Hc : Hb;
  const D = dom * Math.max(30 * Href, 6 * W); // air depth on an open side

  // ---- y stack
  const bands: { y0: number; y1: number; er: number; tand: number }[] = [];
  let y = 0;
  const push = (t: number, er: number, tand: number): void => { bands.push({ y0: y, y1: y + t, er, tand }); y = y + t; };
  if (!xs.baseRef) {
    y = D; // air on the grounded far boundary
    if (xs.baseOpenMask) push(xs.baseOpenMask.t, xs.baseOpenMask.er, xs.baseOpenMask.tand);
  }
  for (let k = xs.base.length - 1; k >= 0; k--) push(xs.base[k].t, xs.base[k].er, xs.base[k].tand);
  const yb = y;
  if (!xs.outer && xs.fill) push(T, xs.fill.er, xs.fill.tand);
  else y = yb + T;
  let ymax: number;
  if (xs.outer) {
    ymax = yb + T + D;
  } else {
    for (const c of xs.cover) push(c.t, c.er, c.tand);
    if (!xs.coverRef) {
      if (xs.coverOpenMask) push(xs.coverOpenMask.t, xs.coverOpenMask.er, xs.coverOpenMask.tand);
      y = y + D;
    }
    ymax = y;
  }
  const xmax = closed ? xb + 10 * ymax + (hasG ? (G as number) : 0) : xb + D + (hasG ? (G as number) : 0);

  // ---- trace slices (one rectangle unless a real trapezoid)
  const trap = isTrapezoid(T, line);
  const slices: Slice[] = [];
  if (!trap) slices.push({ y0: yb, y1: yb + T, xa, xb, xg });
  else {
    const N = Math.max(1, Math.round(line.slices ?? DEFAULT_SLICES));
    const d = W - (line.Wtop as number);
    for (let k = 0; k < N; k++) {
      const inset = (d * (k + 0.5) / N) / 2; // per side, at the slice mid-height; wide side on the base
      slices.push({
        y0: k === 0 ? yb : yb + T * k / N, y1: k === N - 1 ? yb + T : yb + T * (k + 1) / N,
        xa: diff ? xa + inset : 0, xb: xb - inset, xg: xg == null ? null : xg + inset,
      });
    }
  }

  const diel: DielRect[] = bands.map((b) => ({ x0: -1, x1: xmax + 1, y0: b.y0, y1: b.y1, er: b.er, tand: b.tand }));
  const cond: CondRect[] = [];
  for (const s of slices) {
    cond.push({ x0: s.xa, x1: s.xb, y0: s.y0, y1: s.y1, v: 1 });
  }
  for (const s of slices) if (s.xg != null) cond.push({ x0: s.xg, x1: xmax + 10, y0: s.y0, y1: s.y1, v: 0 });

  // ---- keys and fine points (legacy first, in legacy order)
  const keysX = [xa, xb].concat(hasG ? [xg as number] : []);
  const fineX = diff ? [xa, xb] : [xb];
  if (hasG) fineX.push(xg as number);
  const keysY = [yb, yb + T];
  const fineY = [yb, yb + T];
  const addX = (v: number): void => {
    if (!(v > EPS && v < xmax - EPS)) return; // a key outside the domain would extend the axis
    if (!keysX.some((k) => Math.abs(k - v) <= EPS)) keysX.push(v);
    if (!fineX.some((k) => Math.abs(k - v) <= EPS)) fineX.push(v);
  };
  const addY = (v: number): void => {
    if (!(v > EPS && v < ymax - EPS)) return;
    if (!keysY.some((k) => Math.abs(k - v) <= EPS)) keysY.push(v);
  };

  const tm = xs.outer && xs.coverMask ? xs.coverMask.t : 0;
  if (tm > 0) {
    const m = xs.coverMask as { t: number; er: number; tand: number };
    keysY.push(yb + tm, yb + T + tm); // legacy
    diel.push({ x0: -1, x1: xmax + 1, y0: yb, y1: yb + tm, er: m.er, tand: m.tand });
    const n = slices.length;
    slices.forEach((s, k) => {
      const y1 = k === n - 1 ? yb + T + tm : s.y1; // the last piece caps the trace top
      diel.push({ x0: diff ? s.xa - tm : -1, x1: s.xb + tm, y0: s.y0, y1, er: m.er, tand: m.tand });
    });
    slices.forEach((s, k) => {
      if (s.xg == null) return;
      const y1 = k === n - 1 ? yb + T + tm : s.y1;
      diel.push({ x0: s.xg - tm, x1: xmax + 1, y0: s.y0, y1, er: m.er, tand: m.tand });
    });
  }
  // Slice edges and tapered GND edges (a rectangle adds nothing new here).
  for (const s of slices) {
    if (diff) addX(s.xa);
    addX(s.xb);
    if (s.xg != null) addX(s.xg);
    addY(s.y0);
  }
  // Mask walls (legacy left them off the grid: the wall then moved with q and spoiled Richardson).
  if (tm > 0) for (const s of slices) {
    if (diff) addX(s.xa - tm);
    addX(s.xb + tm);
    if (s.xg != null) addX(s.xg - tm);
  }
  for (const b of bands) { addY(b.y0); addY(b.y1); }

  const small = Math.min(W, diff ? S : W, hasG ? (G as number) : W, Href);
  const hmin = Math.max(2e-4, Math.min(T > 0 ? T / 6 : Infinity, small / 12)) / q;
  return {
    xmax, ymax, leftBC: mode === 'odd' ? 'dirichlet' : 'neumann', topBC: 'ground',
    diel, cond, keysX, keysY, fineX, fineY,
    hmin, hmax: 3 * Math.max(Href, W) / q, growth: 1 + 0.18 / q,
    hmaxY: (closed ? Href / 2 : 3 * Math.max(Href, W)) / q,
  };
}
