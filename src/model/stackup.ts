export type Role = 'signal' | 'plane' | 'mixed';
export interface EtchRule { by: 'fraction' | 'factor'; value: number }
export interface CopperLayer {
  kind: 'copper'; id: string; name: string; role: Role; t: number;
  base?: 'auto' | 'above' | 'below';
  etchOverride?: EtchRule;
}
export interface DielectricLayer {
  kind: 'dielectric'; id: string; material: string; type: 'core' | 'prepreg';
  t: number; er: number; tand: number; materialId?: string;
}
export interface Mask { t: number; er: number; tand: number }
export interface Stackup {
  schema: 'lordoftheohms/stackup@1';
  name: string;
  layers: (CopperLayer | DielectricLayer)[];
  maskTop: Mask; maskBottom: Mask;
  etch: { mode: 'rect' | 'trap'; rule: EtchRule };
}

export interface StackupIssue { level: 'error' | 'warning'; msg: string; layerId?: string }

export function coppers(s: Stackup): CopperLayer[] {
  return s.layers.filter((l): l is CopperLayer => l.kind === 'copper');
}

export function validateStackup(s: Stackup): StackupIssue[] {
  const out: StackupIssue[] = [];
  const err = (msg: string, layerId?: string) => out.push({ level: 'error', msg, layerId });
  const L = s.layers;
  if (L.length === 0) { err('Stackup has no layers'); return out; }
  if (L[0].kind !== 'copper') err('Stackup must start with a copper layer', L[0].id);
  if (L[L.length - 1].kind !== 'copper') err('Stackup must end with a copper layer', L[L.length - 1].id);
  const ids = new Set<string>();
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (ids.has(l.id)) err(`Duplicate layer id "${l.id}"`, l.id);
    ids.add(l.id);
    if (i > 0 && l.kind === 'copper' && L[i - 1].kind === 'copper') {
      err('Two copper layers with no dielectric between them', l.id);
    }
    if (l.kind === 'copper') {
      if (!Number.isFinite(l.t) || l.t <= 0) err('Copper thickness must be a finite number > 0', l.id);
    } else {
      if (!Number.isFinite(l.t) || l.t <= 0) err('Dielectric thickness must be a finite number > 0', l.id);
      if (!Number.isFinite(l.er) || l.er < 1) err('Dielectric er must be a finite number >= 1', l.id);
      if (!Number.isFinite(l.tand) || l.tand < 0) err('Dielectric tand must be a finite number >= 0', l.id);
    }
  }
  if (coppers(s).length < 2) err('At least two copper layers are required');
  for (const [nm, m] of [['top', s.maskTop], ['bottom', s.maskBottom]] as const) {
    if (!Number.isFinite(m.t) || m.t < 0) err(`Solder mask (${nm}) thickness must be a finite number >= 0`);
    else if (m.t > 0) {
      if (!Number.isFinite(m.er) || m.er < 1) err(`Solder mask (${nm}) er must be a finite number >= 1`);
      if (!Number.isFinite(m.tand) || m.tand < 0) err(`Solder mask (${nm}) tand must be a finite number >= 0`);
    }
  }
  if (!Number.isFinite(s.etch.rule.value) || s.etch.rule.value <= 0) err('Etch rule value must be a finite number > 0');
  return out;
}

const isRef = (l: CopperLayer | DielectricLayer) =>
  l.kind === 'copper' && (l.role === 'plane' || l.role === 'mixed');

export function defaultRefs(s: Stackup, layerId: string): { above: string | null; below: string | null } {
  const i = s.layers.findIndex((l) => l.id === layerId);
  if (i < 0) return { above: null, below: null };
  let above: string | null = null;
  let below: string | null = null;
  for (let j = i - 1; j >= 0; j--) if (isRef(s.layers[j])) { above = s.layers[j].id; break; }
  for (let j = i + 1; j < s.layers.length; j++) if (isRef(s.layers[j])) { below = s.layers[j].id; break; }
  return { above, below };
}

/** mm reduction W - W_top for the layer, using its own T. */
export function etchReduction(s: Stackup, layerId: string): number {
  const l = s.layers.find((x) => x.id === layerId);
  if (!l || l.kind !== 'copper') throw new Error(`Not a copper layer: ${layerId}`);
  const rule = l.etchOverride ?? s.etch.rule;
  return rule.by === 'fraction' ? rule.value * l.t : (2 * l.t) / rule.value;
}
