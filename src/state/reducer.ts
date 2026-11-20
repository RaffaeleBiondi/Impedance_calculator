import type { AppState, CalcState, ImpClass } from './types';
import { defaultAppState } from './types';
import type { CopperLayer, DielectricLayer, EtchRule, Mask, Stackup } from '../model/stackup';
import { coppers, defaultRefs } from '../model/stackup';
import type { Unit } from '../model/units';

type Layer = CopperLayer | DielectricLayer;

export type Action =
  | { type: 'setUnit'; unit: Unit }
  | { type: 'setStackup'; stackup: Stackup }
  | { type: 'renameStackup'; name: string }
  | { type: 'addLayer'; after: string; kind: 'copper' | 'dielectric' }
  | { type: 'removeLayer'; id: string }
  | { type: 'moveLayer'; id: string; dir: 'up' | 'down' }
  | { type: 'updateLayer'; id: string; patch: Partial<CopperLayer> | Partial<DielectricLayer> }
  | { type: 'setMask'; side: 'top' | 'bottom'; patch: Partial<Mask> }
  | { type: 'setEtch'; patch: { mode?: 'rect' | 'trap'; rule?: EtchRule } }
  | { type: 'setCalc'; patch: Partial<CalcState> }
  | { type: 'selectLayer'; id: string }
  | { type: 'setRefs'; above: string | null; below: string | null }
  | { type: 'setClasses'; classes: ImpClass[] }
  | { type: 'setTableLayers'; ids: string[] }
  | { type: 'resetExample' };

export interface Result { state: AppState; notice?: string }

const tableDefault = (s: Stackup) => coppers(s).filter((c) => c.role !== 'plane').map((c) => c.id);

function freshId(layers: Layer[], prefix: string): string {
  const used = new Set(layers.map((l) => l.id));
  let n = layers.length;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Nearest signal/mixed copper layer to index `at` (falls back to any copper layer). */
function nearestSignal(layers: Layer[], at: number): string | null {
  const pick = (ok: (c: CopperLayer) => boolean) => {
    let best: string | null = null;
    let bd = Infinity;
    layers.forEach((l, i) => {
      if (l.kind === 'copper' && ok(l) && Math.abs(i - at) < bd) { bd = Math.abs(i - at); best = l.id; }
    });
    return best;
  };
  return pick((c) => c.role !== 'plane') ?? pick(() => true);
}

/** References that no longer sit on their side of the trace (or are gone) are reset to the defaults. */
function checkRefs(state: AppState): Result {
  const L = state.stackup.layers;
  const c = state.calc;
  const i = L.findIndex((l) => l.id === c.layerId);
  if (i < 0) return { state };
  const ok = (id: string | null, side: 'above' | 'below') => {
    if (id === null) return true;
    const j = L.findIndex((l) => l.id === id);
    return j >= 0 && L[j].kind === 'copper' && (side === 'above' ? j < i : j > i);
  };
  if (ok(c.refAbove, 'above') && ok(c.refBelow, 'below')) return { state };
  const r = defaultRefs(state.stackup, c.layerId);
  return {
    state: { ...state, calc: { ...c, refAbove: r.above, refBelow: r.below } },
    notice: 'A reference is no longer on its side of the trace; references were reset to the defaults.',
  };
}

/** The selected trace layer is a plane: move to the nearest signal/mixed layer and reset the refs, with a notice. */
function leavePlane(state: AppState, verb: 'is' | 'is now'): Result {
  const L = state.stackup.layers;
  const sel = L.find((l) => l.id === state.calc.layerId);
  if (!sel || sel.kind !== 'copper' || sel.role !== 'plane') return { state };
  const id = nearestSignal(L, L.indexOf(sel));
  const pick = id && id !== sel.id ? (L.find((l) => l.id === id) as CopperLayer) : null;
  if (!pick) return { state, notice: `${sel.name} ${verb} a plane and no signal layer is left.` };
  const r = defaultRefs(state.stackup, pick.id);
  return {
    state: { ...state, calc: { ...state.calc, layerId: pick.id, refAbove: r.above, refBelow: r.below } },
    notice: `${sel.name} ${verb} a plane; selection moved to ${pick.name} and references were reset.`,
  };
}

function withStackup(state: AppState, stackup: Stackup): AppState {
  return { ...state, stackup };
}

export function reducer(state: AppState, a: Action): Result {
  switch (a.type) {
    case 'setUnit':
      return { state: { ...state, unit: a.unit } };

    case 'renameStackup':
      return { state: withStackup(state, { ...state.stackup, name: a.name }) };

    case 'setStackup': {
      let next: AppState = { ...state, stackup: a.stackup, tableLayers: tableDefault(a.stackup) };
      const cs = coppers(a.stackup);
      if (!cs.some((c) => c.id === state.calc.layerId) && cs.length) {
        const id = nearestSignal(a.stackup.layers, 0) ?? cs[0].id;
        const r = defaultRefs(a.stackup, id);
        next = { ...next, calc: { ...state.calc, layerId: id, refAbove: r.above, refBelow: r.below } };
      } else {
        const ids = new Set(a.stackup.layers.map((l) => l.id));
        const c = state.calc;
        next = {
          ...next,
          calc: {
            ...c,
            refAbove: c.refAbove && ids.has(c.refAbove) ? c.refAbove : defaultRefs(a.stackup, c.layerId).above,
            refBelow: c.refBelow && ids.has(c.refBelow) ? c.refBelow : defaultRefs(a.stackup, c.layerId).below,
          },
        };
      }
      // A selected layer that is a plane, or references on the wrong side, fall back with a notice.
      const lp = leavePlane(next, 'is');
      if (lp.notice) return lp;
      return checkRefs(next);
    }

    case 'addLayer': {
      const L = state.stackup.layers;
      const i = L.findIndex((l) => l.id === a.after);
      if (i < 0) return { state };
      const x = L[i];
      const cuN = (): CopperLayer => ({
        kind: 'copper', id: freshId(L, 'cu'), name: `Cu${coppers(state.stackup).length + 1}`, role: 'signal', t: 0.018,
      });
      const dN = (extra?: string): DielectricLayer => ({
        kind: 'dielectric', id: freshId(extra ? [...L, { id: extra } as Layer] : L, 'd'),
        material: 'Generic FR4', type: 'prepreg', t: 0.12, er: 4.2, tand: 0.02,
      });
      let add: Layer[];
      if (a.kind === 'copper') {
        const c = cuN();
        const d = x.kind === 'copper' ? dN() : dN();
        add = x.kind === 'copper' ? [d, c] : [c, d];
      } else {
        const d = dN();
        add = i === L.length - 1 ? [d, cuN()] : [d];
      }
      const layers = [...L.slice(0, i + 1), ...add, ...L.slice(i + 1)];
      // guarantee unique ids when two layers of one kind are added at once
      const seen = new Set<string>();
      const fixed = layers.map((l) => {
        if (!seen.has(l.id)) { seen.add(l.id); return l; }
        const id = freshId([...layers, ...[...seen].map((s) => ({ id: s } as Layer))], l.kind === 'copper' ? 'cu' : 'd');
        seen.add(id);
        return { ...l, id } as Layer;
      });
      const st = withStackup(state, { ...state.stackup, layers: fixed });
      return { state: { ...st, tableLayers: state.tableLayers } };
    }

    case 'removeLayer': {
      const L = state.stackup.layers;
      const i = L.findIndex((l) => l.id === a.id);
      if (i < 0) return { state };
      const layers = L.filter((l) => l.id !== a.id);
      const stackup = { ...state.stackup, layers };
      let calc = state.calc;
      let notice: string | undefined;
      if (calc.layerId === a.id) {
        const id = nearestSignal(layers, Math.min(i, layers.length - 1));
        if (id) {
          const r = defaultRefs(stackup, id);
          calc = { ...calc, layerId: id, refAbove: r.above, refBelow: r.below };
          notice = `Removed the selected layer; selection moved to ${(layers.find((l) => l.id === id) as CopperLayer).name} and references were reset.`;
        }
      } else if (calc.refAbove === a.id || calc.refBelow === a.id) {
        const r = defaultRefs(stackup, calc.layerId);
        calc = { ...calc, refAbove: r.above, refBelow: r.below };
        notice = 'Removed a reference layer; references were reset to the defaults.';
      }
      return {
        state: { ...state, stackup, calc, tableLayers: state.tableLayers.filter((t) => t !== a.id) },
        notice,
      };
    }

    case 'moveLayer': {
      const L = [...state.stackup.layers];
      const i = L.findIndex((l) => l.id === a.id);
      const j = a.dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= L.length) return { state };
      [L[i], L[j]] = [L[j], L[i]];
      return checkRefs(withStackup(state, { ...state.stackup, layers: L }));
    }

    case 'updateLayer': {
      const layers = state.stackup.layers.map((l) => (l.id === a.id ? ({ ...l, ...a.patch } as Layer) : l));
      let next = withStackup(state, { ...state.stackup, layers });
      if (a.patch && 'role' in a.patch) {
        const tl = new Set(state.tableLayers);
        const isPlane = (a.patch as Partial<CopperLayer>).role === 'plane';
        if (isPlane) tl.delete(a.id);
        next = { ...next, tableLayers: [...tl] };
        if (isPlane && state.calc.layerId === a.id) return leavePlane(next, 'is now');
      }
      return { state: next };
    }

    case 'setMask': {
      const key = a.side === 'top' ? 'maskTop' : 'maskBottom';
      return { state: withStackup(state, { ...state.stackup, [key]: { ...state.stackup[key], ...a.patch } }) };
    }

    case 'setEtch':
      return { state: withStackup(state, { ...state.stackup, etch: { ...state.stackup.etch, ...a.patch } }) };

    case 'setCalc':
      return { state: { ...state, calc: { ...state.calc, ...a.patch } } };

    case 'selectLayer': {
      const r = defaultRefs(state.stackup, a.id);
      return { state: { ...state, calc: { ...state.calc, layerId: a.id, refAbove: r.above, refBelow: r.below } } };
    }

    case 'setRefs':
      return { state: { ...state, calc: { ...state.calc, refAbove: a.above, refBelow: a.below } } };

    case 'setClasses':
      return { state: { ...state, classes: a.classes } };

    case 'setTableLayers':
      return { state: { ...state, tableLayers: a.ids } };

    case 'resetExample':
      return { state: { ...defaultAppState(), unit: state.unit }, notice: 'Reset to the example stackup.' };
  }
}
