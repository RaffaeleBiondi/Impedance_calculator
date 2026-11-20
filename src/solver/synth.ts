export interface RootResult { x: number | null; fa?: number; fb?: number; n: number }

/** Root find in log space for monotone f on [lo, hi]: x with f(x) = target, or x = null with the bracket values. */
export function rootLog(f: (x: number) => number, target: number, lo: number, hi: number, tol: number): RootResult {
  let a = Math.log(lo), b = Math.log(hi), fa = f(lo) - target, fb = f(hi) - target, n = 2;
  if (fa * fb > 0) return { x: null, fa: fa + target, fb: fb + target, n };
  let side = 0;
  for (let k = 0; k < 40; k++) {
    const c = (a * fb - b * fa) / (fb - fa);
    const fc = f(Math.exp(c)) - target; n++;
    if (Math.abs(fc) < tol) return { x: Math.exp(c), n };
    if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
    else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
    if (Math.abs(b - a) < 1e-5) return { x: Math.exp(c), n };
  }
  return { x: Math.exp((a + b) / 2), n };
}

export type CompactResult =
  | { ok: true; W: number; S?: number; z: number; F: number; bound: 'wmin' | 'corner' | 'zhi' | 'zlo' }
  | { ok: false; why: 'low' | 'nf'; z?: number };

export interface CompactOpts { target: number; tol: number; diff: boolean; wmin: number; smin: number; step: number }

/**
 * Most compact geometry inside target*(1 +/- tol): narrowest W (single-ended) or smallest 2W+S (pair).
 * Z falls with W and rises with S, so the optimum always sits on a corner: W = wmin or S = smin.
 */
export function compact(
  o: CompactOpts,
  zse?: (W: number) => number,
  zd?: (W: number, S: number) => number,
): CompactResult {
  const step = o.step || 0.005, Zlo = o.target * (1 - o.tol), Zhi = o.target * (1 + o.tol);
  const up = (v: number): number => +(Math.ceil(v / step - 1e-6) * step).toFixed(4);
  if (!o.diff) {
    if (!zse) throw new Error('compact: zse required for single-ended');
    const z0 = zse(o.wmin);
    if (z0 < Zlo) return { ok: false, why: 'low', z: z0 };
    let W = o.wmin, z = z0, bound: 'wmin' | 'zhi' = 'wmin';
    if (z0 > Zhi) {
      const r = rootLog(zse, Zhi, o.wmin, 4, 0.01);
      if (!r.x) return { ok: false, why: 'nf' };
      W = up(r.x); z = zse(W); bound = 'zhi';
      for (let k = 0; k < 3 && z > Zhi; k++) { W = +(W + step).toFixed(4); z = zse(W); }
    }
    return { ok: true, W, z, F: W, bound };
  }
  if (!zd) throw new Error('compact: zd required for differential');
  const z00 = zd(o.wmin, o.smin);
  let W = o.wmin, S = o.smin, z = z00, bound: 'corner' | 'zhi' | 'zlo' = 'corner';
  if (z00 > Zhi) {
    const r = rootLog((w) => zd(w, o.smin), Zhi, o.wmin, 4, 0.01);
    if (!r.x) return { ok: false, why: 'nf' };
    W = up(r.x); z = zd(W, S); bound = 'zhi';
    for (let k = 0; k < 3 && z > Zhi; k++) { W = +(W + step).toFixed(4); z = zd(W, S); }
  } else if (z00 < Zlo) {
    const r = rootLog((s) => zd(o.wmin, s), Zlo, o.smin, 8, 0.01);
    if (!r.x) return { ok: false, why: 'low', z: r.fb };
    S = up(r.x); z = zd(W, S); bound = 'zlo';
    for (let k = 0; k < 3 && z < Zlo; k++) { S = +(S + step).toFixed(4); z = zd(W, S); }
  }
  return { ok: true, W, S, z, F: 2 * W + S, bound };
}
