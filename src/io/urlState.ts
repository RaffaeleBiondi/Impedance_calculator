import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { AppState, CalcState, ImpClass } from '../state/types';
import { checkStackup } from './json';
import { coppers } from '../model/stackup';

type Dec = { ok: true; state: AppState } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const pos = (v: unknown) => num(v) && (v as number) > 0;
const nonNeg = (v: unknown) => num(v) && (v as number) >= 0;
const nonNegOrNull = (v: unknown) => v === null || nonNeg(v);
const strOrNull = (v: unknown) => v === null || typeof v === 'string';

/** Validate an unknown value as AppState. Never throws. */
export function checkAppState(v: unknown): Dec {
  try {
    if (!isObj(v)) return { ok: false, error: 'State is not an object' };
    const st = checkStackup(v.stackup);
    if (!st.ok) return { ok: false, error: st.errors.join('; ') };
    const c = v.calc;
    if (!isObj(c)) return { ok: false, error: 'Missing calculator state' };
    const bad: string[] = [];
    if (typeof c.layerId !== 'string') bad.push('layerId');
    if (!strOrNull(c.refAbove)) bad.push('refAbove');
    if (!strOrNull(c.refBelow)) bad.push('refBelow');
    if (c.type !== 'se' && c.type !== 'diff') bad.push('type');
    for (const k of ['cpw', 'compact'] as const) if (typeof c[k] !== 'boolean') bad.push(k);
    for (const k of ['W', 'target', 'fmin', 'tol', 'freqGHz'] as const) if (!pos(c[k])) bad.push(k);
    for (const k of ['S', 'G'] as const) if (!nonNeg(c[k])) bad.push(k);
    if (c.q !== 1 && c.q !== 2) bad.push('q');
    if (!nonNegOrNull(c.L1)) bad.push('L1');
    if (!nonNegOrNull(c.L2)) bad.push('L2');
    if (bad.length) return { ok: false, error: `Invalid calculator fields: ${bad.join(', ')}` };
    const ids = new Set(coppers(st.stackup).map((l) => l.id));
    const calc = c as unknown as CalcState;
    if (!ids.has(calc.layerId)) return { ok: false, error: `Calculator layer "${calc.layerId}" not in stackup` };
    for (const r of [calc.refAbove, calc.refBelow]) {
      if (r !== null && !ids.has(r)) return { ok: false, error: `Reference layer "${r}" not in stackup` };
    }
    if (v.unit !== 'mm' && v.unit !== 'mil' && v.unit !== 'um') return { ok: false, error: 'Invalid unit' };
    if (!Array.isArray(v.classes)) return { ok: false, error: 'Invalid classes' };
    for (const k of v.classes) {
      const rule = isObj(k) ? k.rule : null;
      const ruleOk = isObj(rule) && (
        rule.kind === 'compact-at-target'
        || (rule.kind === 'fixed-gap' && pos(rule.gap))
        || (rule.kind === 'fixed-pitch' && pos(rule.pitch)));
      if (!isObj(k) || typeof k.id !== 'string' || typeof k.name !== 'string'
        || (k.type !== 'se' && k.type !== 'diff') || !pos(k.target) || !ruleOk || !nonNegOrNull(k.G)) {
        return { ok: false, error: 'Invalid impedance class' };
      }
    }
    if (!Array.isArray(v.tableLayers) || v.tableLayers.some((x) => typeof x !== 'string')) {
      return { ok: false, error: 'Invalid table layers' };
    }
    for (const t of v.tableLayers as string[]) {
      if (!ids.has(t)) return { ok: false, error: `Table layer "${t}" not in stackup` };
    }
    return {
      ok: true,
      state: {
        stackup: st.stackup, calc, unit: v.unit,
        classes: v.classes as unknown as ImpClass[], tableLayers: v.tableLayers as string[],
      },
    };
  } catch (e) {
    return { ok: false, error: `Invalid state: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function encodeHash(st: AppState): string {
  return '#s=' + compressToEncodedURIComponent(JSON.stringify(st));
}

export function decodeHash(hash: string): Dec {
  try {
    const m = /^#?s=(.*)$/.exec(hash);
    if (!m || !m[1]) return { ok: false, error: 'No state in URL hash' };
    const json = decompressFromEncodedURIComponent(m[1]);
    if (!json) return { ok: false, error: 'URL state could not be decompressed' };
    let v: unknown;
    try { v = JSON.parse(json); } catch { return { ok: false, error: 'URL state is not valid JSON' }; }
    return checkAppState(v);
  } catch (e) {
    return { ok: false, error: `URL state invalid: ${e instanceof Error ? e.message : String(e)}` };
  }
}
