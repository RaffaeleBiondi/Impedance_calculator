import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeSelection, reducer } from '../../src/state/reducer';
import { importKicadStackup } from '../../src/io/kicad';
import { defaultAppState } from '../../src/state/types';
import { buildCrossSection } from '../../src/model/crossSection';
import { coppers, defaultRefs } from '../../src/model/stackup';

const base = () => {
  const s = defaultAppState();
  s.calc.layerId = 'cu5';
  return s;
};

describe('reducer', () => {
  it('removeLayer of the selected layer moves selection, resets refs, returns a notice', () => {
    const s = base();
    const r = reducer(s, { type: 'removeLayer', id: 'cu5' });
    expect(r.state.stackup.layers.some((l) => l.id === 'cu5')).toBe(false);
    const sel = r.state.calc.layerId;
    const l = r.state.stackup.layers.find((x) => x.id === sel)!;
    expect(l.kind).toBe('copper');
    expect(l.kind === 'copper' && l.role !== 'plane').toBe(true);
    const d = defaultRefs(r.state.stackup, sel);
    expect(r.state.calc.refAbove).toBe(d.above);
    expect(r.state.calc.refBelow).toBe(d.below);
    expect(r.notice).toBeTruthy();
    expect(r.state.tableLayers).not.toContain('cu5');
  });

  it('updateLayer role->signal on a ref keeps refs and the cross-section warns "signal"', () => {
    const s = base();
    expect(s.calc.refAbove).toBe('cu4');
    const r = reducer(s, { type: 'updateLayer', id: 'cu4', patch: { role: 'signal' } });
    expect(r.state.calc.refAbove).toBe('cu4');
    const xs = buildCrossSection(r.state.stackup, {
      layerId: r.state.calc.layerId, refAbove: r.state.calc.refAbove, refBelow: r.state.calc.refBelow,
    });
    expect(xs.ok).toBe(true);
    if (xs.ok) expect(xs.xs.warnings.join(' ')).toMatch(/signal/);
  });

  it('setUnit mm -> mil -> um -> mm leaves stored numbers bit-identical', () => {
    const s = base();
    const before = JSON.stringify({ st: s.stackup, calc: s.calc });
    let st = s;
    for (const u of ['mil', 'um', 'mm'] as const) st = reducer(st, { type: 'setUnit', unit: u }).state;
    expect(st.unit).toBe('mm');
    expect(JSON.stringify({ st: st.stackup, calc: st.calc })).toBe(before);
  });

  it('addLayer keeps alternation; moveLayer swaps; setMask/setEtch patch', () => {
    const s = base();
    const a = reducer(s, { type: 'addLayer', after: 'cu1', kind: 'copper' }).state;
    expect(a.stackup.layers.length).toBe(s.stackup.layers.length + 2);
    const i = a.stackup.layers.findIndex((l) => l.id === 'cu1');
    expect(a.stackup.layers[i + 1].kind).toBe('dielectric');
    expect(a.stackup.layers[i + 2].kind).toBe('copper');
    const ids = new Set(a.stackup.layers.map((l) => l.id));
    expect(ids.size).toBe(a.stackup.layers.length);
    const m = reducer(s, { type: 'moveLayer', id: 'd0', dir: 'down' }).state;
    expect(m.stackup.layers[1].id).toBe('cu1');
    expect(m.stackup.layers[2].id).toBe('d0');
    const k = reducer(s, { type: 'setMask', side: 'top', patch: { t: 0.02 } }).state;
    expect(k.stackup.maskTop.t).toBe(0.02);
    const e = reducer(s, { type: 'setEtch', patch: { mode: 'trap' } }).state;
    expect(e.stackup.etch.mode).toBe('trap');
  });

  it('selectLayer resets refs to defaults; resetExample restores example with notice', () => {
    const s = base();
    const r = reducer(s, { type: 'selectLayer', id: 'cu2' }).state;
    expect(r.calc.layerId).toBe('cu2');
    const d = defaultRefs(r.stackup, 'cu2');
    expect(r.calc.refAbove).toBe(d.above);
    const x = reducer(r, { type: 'resetExample' });
    expect(x.state.calc.layerId).toBe('cu5');
    expect(x.notice).toBeTruthy();
  });
});

describe('renameStackup', () => {
  it('changes only the name and keeps tableLayers', () => {
    const s = base();
    s.tableLayers = ['cu2'];
    const r = reducer(s, { type: 'renameStackup', name: 'My board' }).state;
    expect(r.stackup.name).toBe('My board');
    expect(r.tableLayers).toEqual(['cu2']);
    expect(r.stackup.layers).toBe(s.stackup.layers);
  });
});

describe('invalid selection fallback (Task 14)', () => {
  it('re-roling the selected layer to plane moves the selection with a notice', () => {
    const s = base();
    const r = reducer(s, { type: 'updateLayer', id: 'cu5', patch: { role: 'plane' } });
    const id = r.state.calc.layerId;
    expect(id).not.toBe('cu5');
    const l = r.state.stackup.layers.find((x) => x.id === id)!;
    expect(l.kind === 'copper' && l.role !== 'plane').toBe(true);
    const d = defaultRefs(r.state.stackup, id);
    expect(r.state.calc.refAbove).toBe(d.above);
    expect(r.state.calc.refBelow).toBe(d.below);
    expect(r.notice).toMatch(/plane/);
  });

  it('re-roling another layer keeps the selection and gives no notice', () => {
    const s = base();
    const r = reducer(s, { type: 'updateLayer', id: 'cu7', patch: { role: 'plane' } });
    expect(r.state.calc.layerId).toBe('cu5');
    expect(r.notice).toBeUndefined();
  });

  it('moving a layer that puts a reference on the wrong side resets the references with a notice', () => {
    const s = base(); // cu5, refs cu4 / cu6
    // move cu5 up twice: past d4 and then past cu4 -> cu4 ends up below the trace
    let r = reducer(s, { type: 'moveLayer', id: 'cu5', dir: 'up' });
    r = reducer(r.state, { type: 'moveLayer', id: 'cu5', dir: 'up' });
    const L = r.state.stackup.layers;
    const i = L.findIndex((l) => l.id === 'cu5');
    const c = r.state.calc;
    if (c.refAbove) expect(L.findIndex((l) => l.id === c.refAbove)).toBeLessThan(i);
    if (c.refBelow) expect(L.findIndex((l) => l.id === c.refBelow)).toBeGreaterThan(i);
    expect(r.notice).toMatch(/reference/i);
  });
});

describe('replaceStackup resets the selection (whole-stackup replacement)', () => {
  const kicad = () => {
    const r = importKicadStackup(readFileSync(new URL('../fixtures/kicad8-6layer.kicad_pcb', import.meta.url), 'utf8'));
    if (!r.ok) throw new Error(r.error);
    return r.stackup;
  };

  it('KiCad import with In3.Cu set to plane: no stale selection from matching ids (repro)', () => {
    const s = base(); // example: In5.Cu = cu5, refs cu4 / cu6
    const st = kicad();
    const in3 = st.layers.find((l) => l.kind === 'copper' && l.name === 'In3.Cu')!;
    if (in3.kind === 'copper') in3.role = 'plane';
    const r = reducer(s, { type: 'replaceStackup', stackup: st });
    const c = r.state.calc;
    const sel = r.state.stackup.layers.find((l) => l.id === c.layerId)!;
    // nearest signal layer from the top, not B.Cu (which happens to be cu5 now)
    expect(sel.kind === 'copper' && sel.name).toBe('F.Cu');
    const d = defaultRefs(r.state.stackup, c.layerId);
    expect([c.refAbove, c.refBelow]).toEqual([d.above, d.below]);
    const refRoles = [c.refAbove, c.refBelow].map((id) => {
      const l = r.state.stackup.layers.find((x) => x.id === id);
      return l && l.kind === 'copper' ? l.role : null;
    });
    expect(refRoles.every((role) => role === null || role !== 'signal')).toBe(true);
    expect(r.state.tableLayers).toEqual(coppers(st).filter((l) => l.role !== 'plane').map((l) => l.id));
    expect(r.notice).toMatch(/F\.Cu/);
  });

  it('replacing with the same ids still resets layer, refs and table layers to the defaults', () => {
    const s = base();
    s.calc.layerId = 'cu7'; s.calc.refAbove = 'cu6'; s.calc.refBelow = 'cu8';
    s.tableLayers = ['cu7'];
    const st = structuredClone(s.stackup);
    const r = reducer(s, { type: 'replaceStackup', stackup: st });
    const fresh = defaultAppState();
    const first = st.layers.find((l) => l.kind === 'copper' && l.role !== 'plane')!;
    expect(r.state.calc.layerId).toBe(first.id);
    const d = defaultRefs(st, first.id);
    expect([r.state.calc.refAbove, r.state.calc.refBelow]).toEqual([d.above, d.below]);
    expect(r.state.tableLayers).toEqual(fresh.tableLayers);
    expect(r.state.calc.W).toBe(s.calc.W); // geometry inputs are kept
    expect(r.notice).toBeTruthy();
  });

  it('a stackup whose top layer is a plane selects the nearest signal layer, never a plane', () => {
    const s = base();
    const st = structuredClone(s.stackup);
    const top = st.layers[0];
    if (top.kind === 'copper') top.role = 'plane';
    const r = reducer(s, { type: 'replaceStackup', stackup: st });
    const sel = r.state.stackup.layers.find((x) => x.id === r.state.calc.layerId)!;
    expect(sel.kind === 'copper' && sel.role !== 'plane').toBe(true);
  });
});

describe('normalizeSelection (loaded state)', () => {
  it('moves a plane selection and wrong-side refs to valid defaults with a notice', () => {
    const s = base();
    const l = s.stackup.layers.find((x) => x.id === 'cu5')!;
    if (l.kind === 'copper') l.role = 'plane';
    const r = normalizeSelection(s);
    const sel = r.state.stackup.layers.find((x) => x.id === r.state.calc.layerId)!;
    expect(sel.kind === 'copper' && sel.role !== 'plane').toBe(true);
    expect(r.notice).toMatch(/plane/);
  });
  it('resets refs on the wrong side', () => {
    const s = base();
    s.calc.refAbove = 'cu6';
    const r = normalizeSelection(s);
    expect(r.state.calc.refAbove).toBe(defaultRefs(s.stackup, 'cu5').above);
    expect(r.notice).toMatch(/reference/i);
  });
  it('leaves a valid selection untouched', () => {
    const s = base();
    const r = normalizeSelection(s);
    expect(r.state).toBe(s);
    expect(r.notice).toBeUndefined();
  });
});
