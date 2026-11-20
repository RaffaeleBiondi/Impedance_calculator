import type { Stackup } from '../model/stackup';
import { validateStackup } from '../model/stackup';

export const STACKUP_SCHEMA = 'lordoftheohms/stackup@1';

type Res = { ok: true; stackup: Stackup } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate an unknown value as a Stackup. Never throws. */
export function checkStackup(v: unknown): Res {
  try {
    if (!isObj(v)) return { ok: false, errors: ['Stackup must be a JSON object'] };
    if (v.schema !== STACKUP_SCHEMA) {
      return { ok: false, errors: [`Unsupported or missing schema (expected "${STACKUP_SCHEMA}")`] };
    }
    const errors: string[] = [];
    if (typeof v.name !== 'string') errors.push('Stackup "name" must be a string');
    if (!Array.isArray(v.layers)) errors.push('Stackup "layers" must be an array');
    for (const k of ['maskTop', 'maskBottom'] as const) {
      if (!isObj(v[k])) errors.push(`Stackup "${k}" must be an object`);
    }
    const et = v.etch;
    if (!isObj(et) || (et.mode !== 'rect' && et.mode !== 'trap') || !isObj(et.rule)
      || (et.rule.by !== 'fraction' && et.rule.by !== 'factor')) {
      errors.push('Stackup "etch" must have mode rect|trap and rule {by, value}');
    }
    if (errors.length) return { ok: false, errors };
    const layers = v.layers as unknown[];
    layers.forEach((l, i) => {
      if (!isObj(l) || (l.kind !== 'copper' && l.kind !== 'dielectric') || typeof l.id !== 'string') {
        errors.push(`Layer #${i + 1} is malformed (needs kind copper|dielectric and an id)`);
      }
    });
    if (errors.length) return { ok: false, errors };
    const s = v as unknown as Stackup;
    const issues = validateStackup(s).filter((x) => x.level === 'error');
    if (issues.length) {
      return { ok: false, errors: issues.map((x) => (x.layerId ? `${x.msg} (layer ${x.layerId})` : x.msg)) };
    }
    return { ok: true, stackup: s };
  } catch (e) {
    return { ok: false, errors: [`Invalid stackup: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

export function parseStackupJson(text: string): Res {
  let v: unknown;
  try { v = JSON.parse(text); } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  return checkStackup(v);
}

export function serializeStackup(s: Stackup): string {
  return JSON.stringify({ ...s, schema: STACKUP_SCHEMA }, null, 2);
}
