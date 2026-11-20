import type { GapRule } from '../model/gapRule';
import { analyze, NO_REFERENCE_SE, type AnalyzeRequest, type AnalyzeResult } from './engine';
import { compact, rootLog, type CompactResult } from './synth';

export type { GapRule } from '../model/gapRule';

export type SynthResult =
  | { ok: true; W: number; S?: number; z: number; result: AnalyzeResult; bound?: string }
  | {
      ok: false;
      reason: 'out-of-range' | 'below-fab' | 'no-reference' | 'error';
      zRange?: [number, number];
      message: string;
      detail?: string;
    };

const ROOT_TOL = 0.005; // ohm
const fz = (v: number): string => v.toFixed(1);
const f3 = (v: number): string => v.toFixed(3);

/** Internal: a refused geometry inside a search evaluator. */
class EvalError extends Error {}

function zOf(req: AnalyzeRequest): number {
  const a = analyze(req);
  if (!a.ok) throw new EvalError(a.error);
  const z = a.kind === 'se' ? a.r.Z0 : a.r.Zdiff;
  if (!Number.isFinite(z)) throw new EvalError('Solver returned a non-finite impedance');
  return z;
}

const withW = (req: AnalyzeRequest, W: number): AnalyzeRequest => ({ ...req, line: { ...req.line, W } });
const withS = (req: AnalyzeRequest, S: number): AnalyzeRequest => ({ ...req, line: { ...req.line, S } });
const withWS = (req: AnalyzeRequest, W: number, S: number): AnalyzeRequest => ({ ...req, line: { ...req.line, W, S } });

function fail(e: unknown, req: AnalyzeRequest): SynthResult {
  if (!(e instanceof EvalError)) throw e;
  if (e.message === NO_REFERENCE_SE) return { ok: false, reason: 'no-reference', message: e.message };
  let message = e.message.split('\n')[0];
  if (/too large/i.test(message) && req.q === 2) message += '; try the normal mesh';
  return { ok: false, reason: 'error', message };
}

/** Move a bracket end inward until the evaluator accepts it (small W under etch, huge meshes). */
function trimmed(f: (x: number) => number, lo: number, hi: number): [number, number] {
  let a = lo, b = hi;
  for (let k = 0; k < 40; k++) { try { f(a); break; } catch (e) { if (!(e instanceof EvalError) || e.message === NO_REFERENCE_SE || k === 39) throw e; a *= 1.25; } }
  for (let k = 0; k < 40; k++) { try { f(b); break; } catch (e) { if (!(e instanceof EvalError) || e.message === NO_REFERENCE_SE || k === 39) throw e; b *= 0.8; } }
  if (!(b > a * 1.0001)) throw new EvalError('No valid geometry in the search range');
  return [a, b];
}

type Search = { x: number } | { x: null; zLo: number; zHi: number; a: number; b: number };

/** Root of f(x) = target on [lo, hi] (f monotone). zLo/zHi are Z at the two ends of the trimmed bracket. */
function search(f: (x: number) => number, target: number, lo: number, hi: number): Search {
  const [a, b] = trimmed(f, lo, hi);
  const r = rootLog(f, target, a, b, ROOT_TOL);
  if (r.x !== null && Number.isFinite(r.x)) return { x: r.x };
  const fa = r.fa ?? f(a), fb = r.fb ?? f(b);
  return { x: null, zLo: Math.min(fa, fb), zHi: Math.max(fa, fb), a, b };
}

function finish(req: AnalyzeRequest, W: number, S: number | undefined, bound?: string): SynthResult {
  const a = analyze(S === undefined ? withW(req, W) : withWS(req, W, S));
  if (!a.ok) return { ok: false, reason: 'error', message: a.error.split('\n')[0] };
  const z = a.kind === 'se' ? a.r.Z0 : a.r.Zdiff;
  return S === undefined ? { ok: true, W, z, result: a, bound } : { ok: true, W, S, z, result: a, bound };
}

/** Width for the target impedance; differential keeps req.line.S fixed. */
export function findW(req: AnalyzeRequest, target: number, lo = 0.02, hi = 4): SynthResult {
  try {
    const s = search((W) => zOf(withW(req, W)), target, lo, hi);
    if (s.x === null) {
      return {
        ok: false, reason: 'out-of-range', zRange: [s.zLo, s.zHi],
        message: `${fz(target)} ohm is out of reach: W ${s.a.toFixed(2)} to ${s.b.toFixed(2)} mm gives ${fz(s.zLo)} to ${fz(s.zHi)} ohm`,
      };
    }
    return finish(req, s.x, req.line.type === 'diff' ? req.line.S : undefined);
  } catch (e) { return fail(e, req); }
}

/** Gap for the target differential impedance with req.line.W fixed. */
export function findS(req: AnalyzeRequest, target: number, lo = 0.02, hi = 6): SynthResult {
  if (req.line.type !== 'diff') return { ok: false, reason: 'error', message: 'Gap search needs a differential pair' };
  try {
    const s = search((S) => zOf(withS(req, S)), target, lo, hi);
    if (s.x === null) {
      const W = req.line.W;
      return {
        ok: false, reason: 'out-of-range', zRange: [s.zLo, s.zHi],
        message: `With W ${f3(W)} mm the pair reaches ${fz(s.zLo)} to ${fz(s.zHi)} ohm, not ${fz(target)}`,
        detail: 'The upper limit is twice the single-ended impedance (traces far apart). Change W to move the range.',
      };
    }
    return finish(req, req.line.W, s.x);
  } catch (e) { return fail(e, req); }
}

/** Fixed pitch W + S = pitch: Z falls monotonically with W. */
function findWPitch(req: AnalyzeRequest, target: number, pitch: number, fmin: number): SynthResult {
  const hi = Math.min(4, pitch - Math.max(fmin, 0.001));
  const lo = 0.02;
  if (!(hi > lo)) {
    return { ok: false, reason: 'below-fab', message: `Pitch ${f3(pitch)} mm leaves no room for W and a gap of ${f3(fmin)} mm` };
  }
  try {
    const f = (W: number): number => zOf(withWS(req, W, pitch - W));
    const s = search(f, target, lo, hi);
    if (s.x === null) {
      return {
        ok: false, reason: 'out-of-range', zRange: [s.zLo, s.zHi],
        message: `At pitch ${f3(pitch)} mm the pair reaches ${fz(s.zLo)} to ${fz(s.zHi)} ohm, not ${fz(target)}`,
      };
    }
    const W = s.x;
    const r = finish(req, W, pitch - W);
    if (r.ok && W < fmin) return belowFab(f, target, W, fmin, hi, req);
    return r;
  } catch (e) { return fail(e, req); }
}

/** Most compact geometry that hits the target exactly, subject to the fab minimum fmin. */
export function compactAtTarget(req: AnalyzeRequest, target: number, fmin: number): SynthResult {
  if (req.line.type === 'se') {
    const r = findW(req, target);
    if (r.ok && r.W < fmin) return belowFab((W) => zOf(withW(req, W)), target, r.W, fmin, 4, req);
    return r;
  }
  // Pair: narrowest W first, then the gap.
  const a = findS(withW(req, fmin), target);
  if (a.ok && a.S! >= fmin) return { ...a, bound: 'wmin' };
  if (a.ok) {
    // Gap would fall below the minimum: pin S = fmin and widen the traces.
    const b = findW(withS(req, fmin), target);
    if (b.ok) return { ...b, bound: 'smin' };
    return b;
  }
  if (a.reason !== 'out-of-range') return a;
  if (a.zRange && target < a.zRange[0]) {
    // Z is above target even at the smallest gap tried: pin S = fmin and widen the traces.
    const b = findW(withS(req, fmin), target);
    return b.ok ? { ...b, bound: 'smin' } : b;
  }
  // Even a very wide gap leaves Z below target at W = fmin: the target needs W under the fab minimum.
  return {
    ok: false, reason: 'below-fab', zRange: a.zRange,
    message: `${fz(target)} ohm needs W below ${f3(fmin)} mm: at that W the pair reaches ${fz(a.zRange![0])} to ${fz(a.zRange![1])} ohm`,
    detail: a.detail,
  };
}

/**
 * Below-fab failure: reports the Z range reachable with the searched dimension >= fmin, up to hi.
 * Z falls with W and rises with the gap; the range is ordered either way.
 */
function belowFab(
  f: (x: number) => number, target: number, x: number, fmin: number, hi: number, req: AnalyzeRequest, name: 'W' | 'gap' = 'W',
): SynthResult {
  try {
    const za = f(fmin);
    const zb = f(hi);
    if (!Number.isFinite(za) || !Number.isFinite(zb)) return { ok: false, reason: 'error', message: 'Could not evaluate the reachable range' };
    const lo = Math.min(za, zb), up = Math.max(za, zb);
    return {
      ok: false, reason: 'below-fab', zRange: [lo, up],
      message: `${fz(target)} ohm needs ${name} ${f3(x)} mm, below the fab minimum ${f3(fmin)} mm; ${name} from ${f3(fmin)} mm gives ${fz(lo)} to ${fz(up)} ohm`,
    };
  } catch (e) { return fail(e, req); }
}

/**
 * Turn a findW (param 'W') or findS (param 'S') success below the fab minimum into a 'below-fab' failure carrying the
 * Z range reachable with that dimension >= fmin (W up to 4 mm, gap up to 6 mm, the default search ranges).
 * Other results pass through unchanged.
 */
export function enforceFabMin(r: SynthResult, req: AnalyzeRequest, target: number, fmin: number, param: 'W' | 'S'): SynthResult {
  if (!r.ok || !(fmin > 0)) return r;
  if (param === 'W') {
    return r.W < fmin - 1e-12 ? belowFab((W) => zOf(withW(req, W)), target, r.W, fmin, 4, req) : r;
  }
  return r.S != null && r.S < fmin - 1e-12 ? belowFab((S) => zOf(withS(req, S)), target, r.S, fmin, 6, req, 'gap') : r;
}

/** Evaluator for compact(): a point the engine refuses is replaced by the nearest accepted one, keeping monotonicity. */
function clamped(f: (x: number) => number, origin: number, factor: number): (x: number) => number {
  return (x) => {
    let v = x;
    for (let k = 0; k < 40; k++) {
      try { return f(v); } catch (e) {
        if (!(e instanceof EvalError) || e.message === NO_REFERENCE_SE || k === 39) throw e;
        v = origin + (v - origin) * factor;
        if (Math.abs(v - origin) < 1e-9) throw e;
      }
    }
    throw new EvalError('No valid geometry in the search range');
  };
}

const COMPACT_WHY: Record<string, (t: number) => string> = {
  wmin: () => 'W is at the fab minimum and Z stays in tolerance.',
  corner: () => 'W and gap are at the fab minimum and Z stays in tolerance.',
  zhi: (t) => `Z is at the upper edge (+${t} %): a narrower trace leaves tolerance, so no margin for process variation.`,
  zlo: (t) => `W is at the minimum and the gap is the smallest that keeps Z above the lower edge (-${t} %): no margin for process variation.`,
};

/** Most compact geometry within target +/- tol (tol is a fraction): narrowest W, or smallest 2W + S for a pair. */
export function compactWithinTol(
  req: AnalyzeRequest,
  o: { target: number; tol: number; fmin: number; step?: number },
): SynthResult & { message?: string } {
  const lim = Math.max(o.fmin, 0.03);
  const pct = +(o.tol * 100).toFixed(2);
  const isDiff = req.line.type === 'diff';
  let c: CompactResult;
  const zw = clamped((W) => zOf(withW(req, W)), lim, 0.8);
  const zdw = clamped((W) => zOf(withWS(req, W, lim)), lim, 0.8);
  const zds = clamped((S) => zOf(withWS(req, lim, S)), lim, 0.8);
  const zd2 = (W: number, S: number): number => {
    let w = W, s = S;
    for (let k = 0; k < 40; k++) {
      try { return zOf(withWS(req, w, s)); } catch (e) {
        if (!(e instanceof EvalError) || e.message === NO_REFERENCE_SE || k === 39) throw e;
        w = lim + (w - lim) * 0.8; s = lim + (s - lim) * 0.8;
        if (w - lim < 1e-9 && s - lim < 1e-9) throw e;
      }
    }
    throw new EvalError('No valid geometry in the search range');
  };
  try {
    c = compact(
      { target: o.target, tol: o.tol, diff: isDiff, wmin: lim, smin: lim, step: o.step ?? 0.005 },
      isDiff ? undefined : zw,
      isDiff ? zd2 : undefined,
    );
  } catch (e) { return fail(e, req); }
  if (!c.ok) {
    try {
      // Reach of the search: W from lim to 4 (and, for a pair, S from lim to 8 at W = lim).
      const zW = [isDiff ? zdw(lim) : zw(lim), isDiff ? zdw(4) : zw(4)];
      const zS = isDiff ? [zds(lim), zds(8)] : zW;
      const all = (c.why === 'low' ? [...zW, ...zS] : zW).filter(Number.isFinite);
      if (all.length === 0) return { ok: false, reason: 'error', message: 'Could not evaluate the reachable range' };
      const zRange: [number, number] = [Math.min(...all), Math.max(...all)];
      if (c.why === 'low') {
        return {
          ok: false, reason: 'out-of-range', zRange,
          message: isDiff
            ? `At W ${lim} mm the pair reaches at most ${fz(zRange[1])} ohm, outside ${o.target} ohm +/-${pct} %`
            : `Even at W ${lim} mm Z is ${fz(zW[0])} ohm, below -${pct} % of ${o.target} ohm`,
          detail: 'Use a smaller fab minimum or a wider tolerance.',
        };
      }
      return {
        ok: false, reason: 'out-of-range', zRange,
        message: `No geometry within +/-${pct} % of ${o.target} ohm: Z reaches ${fz(zRange[0])} to ${fz(zRange[1])} ohm`,
      };
    } catch (e) { return fail(e, req); }
  }
  const r = finish(req, c.W, c.S, c.bound);
  if (!r.ok) return r;
  const head = isDiff
    ? `Most compact pair within +/-${pct} %: W ${f3(c.W)} / gap ${f3(c.S as number)} mm, 2W + gap = ${f3(c.F)} mm.`
    : `Narrowest trace within +/-${pct} %: W ${f3(c.W)} mm.`;
  return { ...r, message: `${head} ${COMPACT_WHY[c.bound](pct)}` };
}

/** One width-table cell: the main value for the gap rule, plus the most compact geometry within tolerance. */
export function tableCell(
  req: AnalyzeRequest, target: number, rule: GapRule, fmin: number, tol: number,
): { main: SynthResult; compact: SynthResult } {
  const compactRes = compactWithinTol(req, { target, tol, fmin });
  let main: SynthResult;
  if (rule.kind === 'compact-at-target') main = compactAtTarget(req, target, fmin);
  else if (rule.kind === 'fixed-gap') {
    const r = req.line.type === 'se' ? req : withS(req, rule.gap);
    main = findW(r, target);
    if (main.ok && main.W < fmin) main = belowFab((W) => zOf(withW(r, W)), target, main.W, fmin, 4, r);
  } else main = req.line.type === 'se' ? findW(req, target) : findWPitch(req, target, rule.pitch, fmin);
  return { main, compact: compactRes };
}

export function roundToStep(v: number, step: number): number {
  return +(Math.round(v / step) * step).toFixed(6);
}
