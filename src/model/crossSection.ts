import type { CopperLayer, DielectricLayer, Mask, Stackup } from './stackup';

export interface Slab { t: number; er: number; tand: number; label: string }
export type Topology =
  | 'microstrip'
  | 'embedded-microstrip'
  | 'stripline-symmetric'
  | 'stripline-asymmetric'
  | 'no-reference';

export interface CrossSection {
  T: number; // trace copper (mm)
  base: Slab[]; // index 0 touches the trace base, outward
  cover: Slab[]; // index 0 sits on top of the trace layer, outward (inner traces only)
  fill: { er: number; tand: number } | null; // inner: cover-side dielectric; outer: null
  outer: boolean; // trace on a board surface: conformal mask + air on the cover side
  coverMask: Mask | null; // conformal mask when outer
  baseRef: boolean; coverRef: boolean; // plane at the far end of base / cover
  baseOpenMask: Mask | null; coverOpenMask: Mask | null; // flat mask at the board surface when a side is open
  flipped: boolean; // true when base is the dielectric above in stackup order
  topology: Topology; notes: string[]; warnings: string[];
}

export interface Selection { layerId: string; refAbove: string | null; refBelow: string | null }

type Layer = CopperLayer | DielectricLayer;
const EPS = 1e-9;

/** Mask as the solver wants it: null when absent (t = 0). */
const maskOrNull = (m: Mask): Mask | null => (m.t > 0 ? { ...m } : null);

/** Merge neighbouring slabs with equal er so that sub-layers compare equal to one thick layer. */
function merged(slabs: Slab[]): { t: number; er: number }[] {
  const out: { t: number; er: number }[] = [];
  for (const s of slabs) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.er - s.er) < EPS) last.t += s.t;
    else out.push({ t: s.t, er: s.er });
  }
  return out;
}

function sameStack(a: Slab[], b: Slab[]): boolean {
  const ma = merged(a);
  const mb = merged(b);
  if (ma.length !== mb.length) return false;
  return ma.every((s, i) => Math.abs(s.t - mb[i].t) < 1e-6 && Math.abs(s.er - mb[i].er) < EPS);
}

export function buildCrossSection(
  s: Stackup, sel: Selection,
): { ok: true; xs: CrossSection } | { ok: false; error: string } {
  const L: Layer[] = s.layers;
  const i = L.findIndex((l) => l.id === sel.layerId);
  if (i < 0) return { ok: false, error: `Unknown layer "${sel.layerId}"` };
  const trace = L[i];
  if (trace.kind !== 'copper') return { ok: false, error: `Layer "${sel.layerId}" is not a copper layer` };
  if (!(trace.t > 0)) return { ok: false, error: `Layer ${trace.name} has no copper thickness` };

  const warnings: string[] = [];
  const notes: string[] = [];

  // Resolve references (index in stackup order, or -1 for none) and check the side.
  const resolve = (id: string | null, side: 'above' | 'below'): { idx: number } | { error: string } => {
    if (id === null) return { idx: -1 };
    const j = L.findIndex((l) => l.id === id);
    if (j < 0) return { error: `Unknown reference layer "${id}"` };
    const ref = L[j];
    if (ref.kind !== 'copper') return { error: `Reference "${id}" is not a copper layer` };
    if (side === 'above' ? j >= i : j <= i) {
      return { error: `Reference ${ref.name} is not ${side} ${trace.name}` };
    }
    if (ref.role === 'signal') warnings.push(`Reference ${ref.name} has role signal, not plane`);
    return { idx: j };
  };
  const ra = resolve(sel.refAbove, 'above');
  if ('error' in ra) return { ok: false, error: ra.error };
  const rb = resolve(sel.refBelow, 'below');
  if ('error' in rb) return { ok: false, error: rb.error };

  const dielAbove = i > 0 && L[i - 1].kind === 'dielectric' ? (L[i - 1] as DielectricLayer) : null;
  const dielBelow = i < L.length - 1 && L[i + 1].kind === 'dielectric' ? (L[i + 1] as DielectricLayer) : null;
  const outer = i === 0 || i === L.length - 1;

  // Orientation: which direction (-1 above, +1 below) is the base side.
  let baseDir: -1 | 1;
  if (outer) baseDir = i === 0 ? 1 : -1;
  else if (trace.base === 'above') baseDir = -1;
  else if (trace.base === 'below') baseDir = 1;
  else {
    const aCore = dielAbove?.type === 'core';
    const bCore = dielBelow?.type === 'core';
    if (aCore && !bCore) baseDir = -1;
    else baseDir = 1; // exactly one core below, or tie: the lower one
  }
  const coverDir = (baseDir === 1 ? -1 : 1) as -1 | 1;
  const baseRefIdx = baseDir === 1 ? rb.idx : ra.idx;
  const coverRefIdx = baseDir === 1 ? ra.idx : rb.idx;

  const fillOf = (j: number, dir: number): { er: number; tand: number } => {
    const nb = [L[j - 1], L[j + 1]].filter((l): l is DielectricLayer => !!l && l.kind === 'dielectric');
    const prepregs = nb.filter((d) => d.type === 'prepreg');
    const pick = prepregs.length === 1 ? prepregs[0] : (L[j - dir] as DielectricLayer); // else nearer the trace
    return { er: pick.er, tand: pick.tand };
  };

  const walk = (dir: -1 | 1, stop: number): Slab[] => {
    const out: Slab[] = [];
    for (let j = i + dir; j >= 0 && j < L.length; j += dir) {
      if (j === stop) break;
      const l = L[j];
      if (l.kind === 'dielectric') {
        out.push({ t: l.t, er: l.er, tand: l.tand, label: l.material });
      } else {
        const f = fillOf(j, dir);
        out.push({ t: l.t, er: f.er, tand: f.tand, label: `${l.name} (cut out)` });
        notes.push(`${l.name} assumed cut out under the trace`);
      }
    }
    return out;
  };

  const base = walk(baseDir, baseRefIdx);
  const baseRef = baseRefIdx >= 0;
  const baseOpenMask = baseRef ? null : maskOrNull(baseDir === 1 ? s.maskBottom : s.maskTop);

  let cover: Slab[] = [];
  let fill: { er: number; tand: number } | null = null;
  let coverRef = false;
  let coverOpenMask: Mask | null = null;
  let coverMask: Mask | null = null;
  if (outer) {
    coverMask = maskOrNull(coverDir === -1 ? s.maskTop : s.maskBottom);
  } else {
    cover = walk(coverDir, coverRefIdx);
    coverRef = coverRefIdx >= 0;
    coverOpenMask = coverRef ? null : maskOrNull(coverDir === -1 ? s.maskTop : s.maskBottom);
    const d = coverDir === -1 ? dielAbove : dielBelow;
    if (!d) return { ok: false, error: `Layer ${trace.name} has no dielectric on its cover side` };
    fill = { er: d.er, tand: d.tand };
  }

  let topology: Topology;
  if (outer) topology = baseRef ? 'microstrip' : 'no-reference';
  else if (baseRef && coverRef) topology = sameStack(base, cover) ? 'stripline-symmetric' : 'stripline-asymmetric';
  else if (baseRef || coverRef) topology = 'embedded-microstrip';
  else topology = 'no-reference';

  return {
    ok: true,
    xs: {
      T: trace.t, base, cover, fill, outer, coverMask, baseRef, coverRef,
      baseOpenMask, coverOpenMask, flipped: baseDir === -1, topology,
      notes: [...new Set(notes)], warnings,
    },
  };
}
