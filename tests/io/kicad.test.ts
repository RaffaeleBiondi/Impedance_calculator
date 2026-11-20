import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importKicadStackup } from '../../src/io/kicad';
import { parseSexpr } from '../../src/io/sexpr';
import { coppers, validateStackup } from '../../src/model/stackup';

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

describe('parseSexpr', () => {
  it('parses quoted strings, numbers and starts at (layers', () => {
    const r = parseSexpr('junk (a) (layers (0 "F.Cu" signal)) (setup (x 1.5 "a b"))') as unknown[];
    expect(r[0]).toEqual(['layers', [0, 'F.Cu', 'signal']]);
    expect(r[1]).toEqual(['setup', ['x', 1.5, 'a b']]);
  });
});

describe('importKicadStackup', () => {
  it('imports the KiCad 7 4-layer fixture', () => {
    const r = importKicadStackup(fx('kicad7-4layer.kicad_pcb'));
    if (!r.ok) throw new Error(r.error);
    expect(r.needsRoleReview).toBe(true);
    const cu = coppers(r.stackup);
    expect(cu.map((c) => c.name)).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']);
    expect(cu.map((c) => c.t)).toEqual([0.035, 0.0175, 0.0175, 0.035]);
    expect(cu.map((c) => c.role)).toEqual(['signal', 'plane', 'mixed', 'signal']);
    const d = r.stackup.layers.filter((l) => l.kind === 'dielectric');
    expect(d.map((l) => l.kind === 'dielectric' && [l.type, l.t, l.er, l.tand])).toEqual([
      ['prepreg', 0.11, 4.1, 0.018], ['core', 1.2, 4.4, 0.016], ['prepreg', 0.11, 4.1, 0.018],
    ]);
    expect(r.stackup.maskTop).toEqual({ t: 0.02, er: 3.8, tand: 0.025 });
    expect(r.stackup.maskBottom).toEqual({ t: 0.02, er: 3.8, tand: 0.025 });
    expect(r.stackup.name).toBe('Imported from KiCad');
    expect(r.stackup.etch).toEqual({ mode: 'rect', rule: { by: 'fraction', value: 0.7 } });
    expect(r.warnings).toEqual([]);
    expect(validateStackup(r.stackup).filter((i) => i.level === 'error')).toEqual([]);
    expect(new Set(r.stackup.layers.map((l) => l.id)).size).toBe(r.stackup.layers.length);
  });

  it('imports the 6-layer fixture, jumper -> signal, missing mask eps warns', () => {
    const r = importKicadStackup(fx('kicad8-6layer.kicad_pcb'));
    if (!r.ok) throw new Error(r.error);
    const cu = coppers(r.stackup);
    expect(cu).toHaveLength(6);
    expect(cu[4].role).toBe('signal');
    expect(r.stackup.maskTop).toEqual({ t: 0.015, er: 3.3, tand: 0.02 });
    expect(r.warnings.filter((w) => /F\.Mask.*epsilon_r/.test(w))).toHaveLength(1);
    expect(r.warnings.filter((w) => /B\.Mask.*loss_tangent/.test(w))).toHaveLength(1);
  });

  it('matches by name for KiCad 9 numbering and splits sublayers', () => {
    const r = importKicadStackup(fx('kicad9-4layer-sublayers.kicad_pcb'));
    if (!r.ok) throw new Error(r.error);
    expect(coppers(r.stackup).map((c) => [c.name, c.role])).toEqual([
      ['F.Cu', 'signal'], ['In1.Cu', 'plane'], ['In2.Cu', 'plane'], ['B.Cu', 'signal'],
    ]);
    const L = r.stackup.layers;
    expect(L.map((l) => l.kind)).toEqual([
      'copper', 'dielectric', 'dielectric', 'copper', 'dielectric', 'copper', 'dielectric', 'copper',
    ]);
    const d1 = L[1], d2 = L[2];
    expect(d1.kind === 'dielectric' && [d1.material, d1.t, d1.er]).toEqual(['Resin X', 0.06, 3.9]);
    expect(d2.kind === 'dielectric' && [d2.material, d2.t, d2.er]).toEqual(['Glass X', 0.06, 4.2]);
  });

  it('keeps a dielectric without epsilon_r as NaN with a warning', () => {
    const r = importKicadStackup(fx('kicad9-4layer-sublayers.kicad_pcb'));
    if (!r.ok) throw new Error(r.error);
    const d = r.stackup.layers.find((l) => l.kind === 'dielectric' && l.material === 'Prepreg C');
    expect(d && d.kind === 'dielectric' && Number.isNaN(d.er)).toBe(true);
    expect(r.warnings.some((w) => /dielectric 3.*epsilon_r/.test(w))).toBe(true);
    expect(validateStackup(r.stackup).some((i) => i.level === 'error' && /er/.test(i.msg))).toBe(true);
  });

  it('rejects non-board input and boards without a stackup', () => {
    expect(importKicadStackup('not a board').ok).toBe(false);
    expect(importKicadStackup('(kicad_pcb (layers (0 "F.Cu" signal)) (setup (pad_to_mask_clearance 0)))').ok).toBe(false);
  });

  it('ignores inherited keys as layer types: a layer typed "constructor" is assumed signal with a warning', () => {
    const text = fx('kicad7-4layer.kicad_pcb').replace('(1 "In1.Cu" power)', '(1 "In1.Cu" constructor)');
    const r = importKicadStackup(text);
    if (!r.ok) throw new Error(r.error);
    const in1 = coppers(r.stackup).find((c) => c.name === 'In1.Cu')!;
    expect(in1.role).toBe('signal');
    expect(r.warnings.some((w) => /In1\.Cu: no layer type/.test(w))).toBe(true);
    for (const t of ['toString', '__proto__', 'hasOwnProperty']) {
      const x = importKicadStackup(fx('kicad7-4layer.kicad_pcb').replace('(1 "In1.Cu" power)', `(1 "In1.Cu" ${t})`));
      if (!x.ok) throw new Error(x.error);
      expect(['signal', 'plane', 'mixed']).toContain(coppers(x.stackup)[1].role);
    }
  });

  it('runs the stackup validation on the import output', () => {
    const good = importKicadStackup(fx('kicad7-4layer.kicad_pcb'));
    if (!good.ok) throw new Error(good.error);
    expect(good.errors).toEqual([]);
    const bad = importKicadStackup(fx('kicad9-4layer-sublayers.kicad_pcb'));
    if (!bad.ok) throw new Error(bad.error);
    expect(bad.errors.some((e) => /er must be/.test(e) && /Prepreg C/.test(e))).toBe(true);
  });
});
