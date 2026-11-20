import { describe, it, expect } from 'vitest';
import { exampleStackup } from '../../src/model/example';
import { buildCrossSection, type CrossSection } from '../../src/model/crossSection';
import { defaultRefs } from '../../src/model/stackup';

function ok(sel: { layerId: string; refAbove: string | null; refBelow: string | null }, s = exampleStackup()): CrossSection {
  const r = buildCrossSection(s, sel);
  if (!r.ok) throw new Error(r.error);
  return r.xs;
}
function withDefaults(layerId: string): CrossSection {
  const s = exampleStackup();
  const d = defaultRefs(s, layerId);
  return ok({ layerId, refAbove: d.above, refBelow: d.below }, s);
}

describe('buildCrossSection', () => {
  it('In5 with default refs: stripline-asymmetric, core below is base', () => {
    const xs = withDefaults('cu5');
    expect(xs.T).toBe(0.018);
    expect(xs.base).toHaveLength(1);
    expect(xs.base[0]).toMatchObject({ t: 0.2, er: 4.35 });
    expect(xs.fill).toEqual({ er: 3.93, tand: 0.02 });
    expect(xs.cover).toHaveLength(1);
    expect(xs.cover[0]).toMatchObject({ t: 0.14, er: 3.93 });
    expect(xs.baseRef).toBe(true);
    expect(xs.coverRef).toBe(true);
    expect(xs.outer).toBe(false);
    expect(xs.topology).toBe('stripline-asymmetric');
    expect(xs.flipped).toBe(false);
  });

  it('In7: base core d7 below, cover prepreg d6', () => {
    const xs = withDefaults('cu7');
    expect(xs.base[0]).toMatchObject({ t: 0.2, er: 4.35 });
    expect(xs.cover[0]).toMatchObject({ t: 0.14, er: 3.93 });
    expect(xs.flipped).toBe(false);
  });

  it('In2: core above is base, flipped', () => {
    const xs = withDefaults('cu2');
    expect(xs.base[0]).toMatchObject({ t: 0.2, er: 4.35 });
    expect(xs.cover[0]).toMatchObject({ t: 0.14, er: 3.93 });
    expect(xs.flipped).toBe(true);
  });

  it('F.Cu with refBelow cu1: microstrip with conformal mask', () => {
    const xs = ok({ layerId: 'cu0', refAbove: null, refBelow: 'cu1' });
    expect(xs.outer).toBe(true);
    expect(xs.T).toBe(0.035);
    expect(xs.base).toHaveLength(1);
    expect(xs.base[0]).toMatchObject({ t: 0.12, er: 4.17 });
    expect(xs.coverMask).toMatchObject({ t: 0.01, er: 3.3 });
    expect(xs.cover).toEqual([]);
    expect(xs.fill).toBeNull();
    expect(xs.baseRef).toBe(true);
    expect(xs.coverRef).toBe(false);
    expect(xs.topology).toBe('microstrip');
    expect(xs.flipped).toBe(false);
  });

  it('B.Cu: base d8 above, flipped, microstrip', () => {
    const xs = ok({ layerId: 'cu9', refAbove: 'cu8', refBelow: null });
    expect(xs.base[0]).toMatchObject({ t: 0.12, er: 4.17 });
    expect(xs.flipped).toBe(true);
    expect(xs.outer).toBe(true);
    expect(xs.topology).toBe('microstrip');
  });

  it('skipped copper becomes a fill slab and a note', () => {
    const xs = ok({ layerId: 'cu5', refAbove: 'cu3', refBelow: 'cu6' });
    expect(xs.cover).toHaveLength(3);
    expect(xs.cover[0]).toMatchObject({ t: 0.14, er: 3.93 });
    expect(xs.cover[1]).toMatchObject({ t: 0.018, er: 3.93 });
    expect(xs.cover[2]).toMatchObject({ t: 0.2, er: 4.35 });
    expect(xs.notes.join(' ')).toContain('In4.Cu assumed cut out');
  });

  it('embedded microstrip: cover continues to the top surface', () => {
    const xs = ok({ layerId: 'cu5', refAbove: null, refBelow: 'cu6' });
    expect(xs.topology).toBe('embedded-microstrip');
    expect(xs.coverRef).toBe(false);
    expect(xs.baseRef).toBe(true);
    expect(xs.coverOpenMask).toMatchObject({ t: 0.01, er: 3.3 });
    expect(xs.baseOpenMask).toBeNull();
    const total = xs.cover.reduce((a, b) => a + b.t, 0);
    // d4..d0 + cu4..cu0 on the way up
    const expected = 0.14 + 0.2 + 0.14 + 0.2 + 0.12 + 3 * 0.018 + 0.018 + 0.035;
    expect(total).toBeCloseTo(expected, 9);
    expect(xs.notes.join(' ')).toContain('In4.Cu assumed cut out');
  });

  it('no reference', () => {
    const xs = ok({ layerId: 'cu0', refAbove: null, refBelow: null });
    expect(xs.topology).toBe('no-reference');
    expect(xs.baseRef).toBe(false);
    expect(xs.baseOpenMask).toMatchObject({ t: 0.01 });
  });

  it('signal-role reference is allowed with a warning', () => {
    const xs = ok({ layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu7' });
    expect(xs.warnings.join(' ')).toContain('signal');
  });

  it('reference on the wrong side is an error', () => {
    const r = buildCrossSection(exampleStackup(), { layerId: 'cu5', refAbove: null, refBelow: 'cu3' });
    expect(r.ok).toBe(false);
    const r2 = buildCrossSection(exampleStackup(), { layerId: 'cu5', refAbove: 'cu7', refBelow: null });
    expect(r2.ok).toBe(false);
  });

  it('unknown layer or non-copper layer is an error', () => {
    expect(buildCrossSection(exampleStackup(), { layerId: 'nope', refAbove: null, refBelow: null }).ok).toBe(false);
    expect(buildCrossSection(exampleStackup(), { layerId: 'd1', refAbove: null, refBelow: null }).ok).toBe(false);
    expect(buildCrossSection(exampleStackup(), { layerId: 'cu5', refAbove: 'd4', refBelow: null }).ok).toBe(false);
  });

  it('base override on a layer with two prepreg neighbours', () => {
    const s = exampleStackup();
    // make d5 a prepreg so cu5 has prepreg on both sides
    const d5 = s.layers.find((l) => l.id === 'd5')!;
    if (d5.kind === 'dielectric') d5.type = 'prepreg';
    const cu5 = s.layers.find((l) => l.id === 'cu5')!;
    const auto = ok({ layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' }, s);
    expect(auto.flipped).toBe(false);
    if (cu5.kind === 'copper') cu5.base = 'above';
    const xs = ok({ layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' }, s);
    expect(xs.flipped).toBe(true);
    expect(xs.base[0]).toMatchObject({ t: 0.14, er: 3.93 });
    expect(xs.cover[0]).toMatchObject({ t: 0.2 });
  });

  it('symmetric stripline when both sides match', () => {
    const s = exampleStackup();
    for (const l of s.layers) if (l.kind === 'dielectric' && (l.id === 'd4' || l.id === 'd5')) { l.t = 0.2; l.er = 4; l.type = 'prepreg'; }
    const xs = ok({ layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' }, s);
    expect(xs.topology).toBe('stripline-symmetric');
  });
});
