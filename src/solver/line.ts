import { makeGrid } from './grid';
import { solveCap } from './fv';
import type { BuildFn, DiffResult, FieldData, Mode, SEResult } from './types';

const C0 = 299792458; // m/s
const EPS0 = 8.8541878128e-12; // F/m

interface Pair { C: number; Ca: number; n: number; iters: number; field: FieldData }

function capPair(build: BuildFn, mode: Mode, q: number): Pair {
  const p = build(mode, q);
  const grid = makeGrid(p);
  const cd = solveCap(p, grid, true), ca = solveCap(p, grid, false);
  const k = mode === 'se' ? 2 : 1; // half domain holds half the SE trace, or one full trace of the pair
  return {
    C: k * cd.c * EPS0, Ca: k * ca.c * EPS0, n: grid.xs.length * grid.ys.length,
    iters: cd.iters + ca.iters, field: { V: cd.V, xs: grid.xs, ys: grid.ys },
  };
}

function zFrom(C: number, Ca: number): { z: number; eeff: number } {
  return { z: 1 / (C0 * Math.sqrt(C * Ca)), eeff: C / Ca };
}

/** Single-ended line. */
export function analyzeSE(build: BuildFn, q: number): SEResult {
  const r = capPair(build, 'se', q);
  const z = zFrom(r.C, r.Ca);
  return { Z0: z.z, eeff: z.eeff, tpd: Math.sqrt(z.eeff) / C0 * 1e9, C: r.C, nodes: r.n, iters: r.iters, field: r.field };
}

/** Edge-coupled pair. */
export function analyzeDiff(build: BuildFn, q: number): DiffResult {
  const o = capPair(build, 'odd', q), e = capPair(build, 'even', q);
  const zo = zFrom(o.C, o.Ca), ze = zFrom(e.C, e.Ca);
  return {
    Zodd: zo.z, Zeven: ze.z, Zdiff: 2 * zo.z, Zcm: ze.z / 2, eodd: zo.eeff, eeven: ze.eeff,
    tpdOdd: Math.sqrt(zo.eeff) / C0 * 1e9, kb: (ze.z - zo.z) / (ze.z + zo.z),
    nodes: o.n, iters: o.iters + e.iters, field: o.field,
  };
}

/** Richardson extrapolation from meshes q and 2q (order 1.5 with thick copper, 1 for zero thickness). */
function rich<R extends object>(fn: (build: BuildFn, q: number) => R, build: BuildFn, q: number, order: number): R {
  q = q || 1;
  const a = fn(build, q) as Record<string, unknown>, b = fn(build, 2 * q) as Record<string, unknown>;
  const f = 1 / (Math.pow(2, order) - 1), out: Record<string, unknown> = Object.assign({}, b);
  for (const k of ['Z0', 'Zodd', 'Zeven', 'Zdiff', 'Zcm', 'eeff', 'eodd', 'eeven', 'tpd', 'tpdOdd']) {
    const bk = b[k], ak = a[k];
    if (typeof bk === 'number') out[k] = bk + (bk - (ak as number)) * f;
  }
  if (out.Zodd) out.kb = ((out.Zeven as number) - (out.Zodd as number)) / ((out.Zeven as number) + (out.Zodd as number));
  out.meshDelta = Math.abs(((b.Z0 as number) || (b.Zdiff as number)) / ((a.Z0 as number) || (a.Zdiff as number)) - 1);
  return out as unknown as R;
}

export function richSE(build: BuildFn, q: number, order: number): SEResult {
  return rich(analyzeSE, build, q, order);
}

export function richDiff(build: BuildFn, q: number, order: number): DiffResult {
  return rich(analyzeDiff, build, q, order);
}
