import type { CopperLayer, DielectricLayer, Mask, Role, Stackup } from '../../src/model/stackup';
import { buildCrossSection, type CrossSection, type Selection } from '../../src/model/crossSection';

/** Layer shorthand: ['cu', t, role] or ['d', t, er, type]. Ids are cu0, cu1, … and d0, d1, … in order. */
export type LayerSpec = ['cu', number, Role?] | ['d', number, number, DielectricLayer['type']?];

export function stack(spec: LayerSpec[], mask: Mask = { t: 0, er: 1, tand: 0 }, name = 'test'): Stackup {
  let nc = 0, nd = 0;
  const layers: Stackup['layers'] = spec.map((l): CopperLayer | DielectricLayer => {
    if (l[0] === 'cu') {
      const id = `cu${nc++}`;
      return { kind: 'copper', id, name: id, role: l[2] ?? 'plane', t: l[1] };
    }
    const id = `d${nd++}`;
    return { kind: 'dielectric', id, material: id, type: l[3] ?? 'prepreg', t: l[1], er: l[2], tand: 0.02 };
  });
  return {
    schema: 'lordoftheohms/stackup@1', name, layers,
    maskTop: { ...mask }, maskBottom: { ...mask },
    etch: { mode: 'rect', rule: { by: 'fraction', value: 0.7 } },
  };
}

export function xsOf(s: Stackup, sel: Selection): CrossSection {
  const r = buildCrossSection(s, sel);
  if (!r.ok) throw new Error(r.error);
  return r.xs;
}

export const sel = (layerId: string, refAbove: string | null, refBelow: string | null): Selection =>
  ({ layerId, refAbove, refBelow });

/** Spec Appendix B "outer" board: micro, T 0.035, H 0.12, er 3.9, mask 0.01 / 3.3. Trace on cu0, ref cu1. */
export function outerB(): Stackup {
  return stack([
    ['cu', 0.035, 'signal'], ['d', 0.12, 3.9], ['cu', 0.035], ['d', 0.2, 3.9, 'core'], ['cu', 0.035],
  ], { t: 0.01, er: 3.3, tand: 0.02 });
}

/** Spec Appendix B "inner" board: strip, T 0.035, H1 0.2 (core, base), H2 0.14, er 3.9. Trace on cu2, refs cu1 / cu3. */
export function innerB(): Stackup {
  return stack([
    ['cu', 0.035, 'signal'], ['d', 0.12, 3.9], ['cu', 0.035], ['d', 0.2, 3.9, 'core'], ['cu', 0.035, 'signal'],
    ['d', 0.14, 3.9], ['cu', 0.035], ['d', 0.12, 3.9, 'core'], ['cu', 0.035, 'signal'],
  ], { t: 0.01, er: 3.3, tand: 0.02 });
}
