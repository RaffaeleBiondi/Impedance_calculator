import type { CopperLayer, DielectricLayer, Mask, Role, Stackup } from '../model/stackup';
import { parseSexpr, type SNode } from './sexpr';

export type KicadImportResult =
  | { ok: true; stackup: Stackup; warnings: string[]; needsRoleReview: true }
  | { ok: false; error: string };

const isList = (n: SNode | undefined): n is SNode[] => Array.isArray(n);
const head = (n: SNode) => (isList(n) ? n[0] : undefined);
const sub = (l: SNode[], key: string): SNode[] | undefined =>
  l.find((c) => isList(c) && c[0] === key) as SNode[] | undefined;
const num = (l: SNode[] | undefined): number | undefined => {
  const v = l?.[1];
  return typeof v === 'number' ? v : undefined;
};
const str = (l: SNode[] | undefined): string | undefined => {
  const v = l?.[1];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
};

const ROLE: Record<string, Role> = { signal: 'signal', power: 'plane', mixed: 'mixed', jumper: 'signal' };

interface Group { t?: number; material?: string; er?: number; tand?: number }

function group(items: SNode[]): Group {
  return {
    t: num(sub(items, 'thickness')),
    material: str(sub(items, 'material')),
    er: num(sub(items, 'epsilon_r')),
    tand: num(sub(items, 'loss_tangent')),
  };
}

/** Split a dielectric layer's items at bare `addsublayer` atoms into property groups. */
function groups(items: SNode[]): Group[] {
  const parts: SNode[][] = [[]];
  for (const it of items) {
    if (it === 'addsublayer') parts.push([]);
    else parts[parts.length - 1].push(it);
  }
  return parts.map(group);
}

export function importKicadStackup(text: string): KicadImportResult {
  let forms: SNode;
  try { forms = parseSexpr(text); } catch { return { ok: false, error: 'Could not parse the file as a KiCad board.' }; }
  if (!isList(forms) || forms.length === 0) {
    return { ok: false, error: 'Not a KiCad board file: no (layers ...) section found.' };
  }
  const layersForm = forms.find((f) => head(f) === 'layers') as SNode[] | undefined;
  const setup = forms.find((f) => head(f) === 'setup') as SNode[] | undefined;
  const stackup = setup ? sub(setup, 'stackup') : undefined;
  if (!layersForm) return { ok: false, error: 'No (layers ...) section found.' };
  if (!stackup) {
    return { ok: false, error: 'This board has no stackup defined (setup > stackup). Define it in KiCad Board Setup first.' };
  }

  const warnings: string[] = [];
  const roleByName = new Map<string, Role>();
  for (const e of layersForm.slice(1)) {
    if (isList(e) && typeof e[1] === 'string' && typeof e[2] === 'string' && e[2] in ROLE) {
      roleByName.set(e[1], ROLE[e[2]]);
    }
  }

  const layers: (CopperLayer | DielectricLayer)[] = [];
  const masks: { top?: Mask; bottom?: Mask } = {};
  let ci = 0;
  let di = 0;

  const maskOf = (items: SNode[], label: string): Mask => {
    const g = group(items);
    let er = g.er;
    let tand = g.tand;
    if (er === undefined) { er = 3.3; warnings.push(`${label}: epsilon_r missing, using 3.3 - check it.`); }
    if (tand === undefined) { tand = 0.02; warnings.push(`${label}: loss_tangent missing, using 0.02 - check it.`); }
    return { t: g.t ?? 0, er, tand };
  };

  for (const entry of stackup.slice(1)) {
    if (!isList(entry) || entry[0] !== 'layer') continue;
    const name = entry[1];
    if (typeof name !== 'string') continue;
    const items = entry.slice(2);
    const type = str(sub(items, 'type')) ?? '';
    if (type === 'copper') {
      const t = num(sub(items, 'thickness'));
      if (t === undefined) warnings.push(`${name}: copper thickness missing.`);
      let role = roleByName.get(name);
      if (!role) { role = 'signal'; warnings.push(`${name}: no layer type found in (layers ...), assuming signal.`); }
      layers.push({ kind: 'copper', id: `cu${ci++}`, name, role, t: t ?? NaN });
    } else if (type === 'core' || type === 'prepreg') {
      const gs = groups(items);
      gs.forEach((g, k) => {
        const label = gs.length > 1 ? `${name} (sub-layer ${k + 1})` : name;
        if (g.t === undefined) warnings.push(`${label}: thickness missing.`);
        if (g.er === undefined) warnings.push(`${label}: epsilon_r missing - set it before use.`);
        if (g.tand === undefined) warnings.push(`${label}: loss_tangent missing - set it before use.`);
        layers.push({
          kind: 'dielectric', id: `d${di++}`, material: g.material ?? '', type,
          t: g.t ?? NaN, er: g.er ?? NaN, tand: g.tand ?? NaN,
        });
      });
    } else if (type === 'Top Solder Mask') masks.top = maskOf(items, name);
    else if (type === 'Bottom Solder Mask') masks.bottom = maskOf(items, name);
    // silkscreen, paste and anything else: skipped
  }

  if (!layers.some((l) => l.kind === 'copper')) {
    return { ok: false, error: 'The stackup contains no copper layers.' };
  }
  const noMask = (side: string): Mask => {
    warnings.push(`No ${side} solder mask in the stackup, using thickness 0.`);
    return { t: 0, er: 3.3, tand: 0.02 };
  };
  return {
    ok: true,
    needsRoleReview: true,
    warnings,
    stackup: {
      schema: 'lordoftheohms/stackup@1',
      name: 'Imported from KiCad',
      layers,
      maskTop: masks.top ?? noMask('top'),
      maskBottom: masks.bottom ?? noMask('bottom'),
      etch: { mode: 'rect', rule: { by: 'fraction', value: 0.7 } },
    },
  };
}
