import { describe, it, expect } from 'vitest';
import { reducer } from '../../src/state/reducer';
import { defaultAppState } from '../../src/state/types';
import { buildCrossSection } from '../../src/model/crossSection';
import { defaultRefs } from '../../src/model/stackup';

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
