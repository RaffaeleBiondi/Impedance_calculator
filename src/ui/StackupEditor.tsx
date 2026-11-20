import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { CopperLayer, DielectricLayer, EtchRule, Role, Stackup } from '../model/stackup';
import { validateStackup } from '../model/stackup';
import type { Unit } from '../model/units';
import { parseStackupJson, serializeStackup } from '../io/json';
import { encodeHash } from '../io/urlState';
import { KEYS, storage } from '../io/storage';
import { LenInput } from './LenInput';
import { NumInput } from './NumInput';
import { MaterialPicker } from './MaterialPicker';

type Saved = Record<string, Stackup>;
const readSaved = (): Saved => {
  const v = storage.get<unknown>(KEYS.saved);
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Saved) : {};
};

export function StackupEditor({ onImportKicad }: { onImportKicad?: () => void } = {}) {
  const { state, dispatch } = useStore();
  const { stackup, unit, calc } = state;
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [pick, setPick] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const issues = validateStackup(stackup);
  const errors = issues.filter((i) => i.level === 'error');

  const save = () => {
    const name = stackup.name.trim() || 'Untitled';
    const next = { ...readSaved(), [name]: stackup };
    if (storage.set(KEYS.saved, next)) { setSaved(next); setPick(name); setMsg(`Saved "${name}" in this browser.`); }
    else setMsg('Could not save: browser storage is unavailable.');
  };
  const load = () => {
    const s = saved[pick];
    if (s) dispatch({ type: 'setStackup', stackup: s });
  };
  const del = () => {
    const next = { ...readSaved() };
    delete next[pick];
    storage.set(KEYS.saved, next);
    setSaved(next); setPick('');
  };
  const exportJson = () => {
    const blob = new Blob([serializeStackup(stackup)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(stackup.name || 'stackup').replace(/[^\w.-]+/g, '_')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (f: File) => {
    const r = parseStackupJson(await f.text());
    if (r.ok) { dispatch({ type: 'setStackup', stackup: r.stackup }); setMsg(`Imported "${r.stackup.name}".`); }
    else setMsg(`Import failed: ${r.errors.join('; ')}`);
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}${encodeHash(state)}`;
    try { await navigator.clipboard.writeText(url); setMsg('Share link copied to the clipboard.'); }
    catch { window.prompt('Copy this link', url); }
  };

  const L = stackup.layers;
  return (
    <section className="panel editor" aria-label="Stackup editor">
      <h2>Stackup</h2>

      <div className="row">
        <label className="grow">Name
          <input value={stackup.name} onChange={(e) => dispatch({ type: 'renameStackup', name: e.target.value })} />
        </label>
        <label>Unit
          <select value={unit} onChange={(e) => dispatch({ type: 'setUnit', unit: e.target.value as Unit })} aria-label="Display unit">
            <option value="mm">mm</option><option value="mil">mil</option><option value="um">&micro;m</option>
          </select>
        </label>
      </div>

      <div className="tablewrap">
        <table className="layers">
          <thead>
            <tr><th>Layer</th><th>Role / type</th><th>Thickness ({unit === 'um' ? 'µm' : unit})</th><th>Material</th><th>&epsilon;r</th><th>tan&delta;</th><th /></tr>
          </thead>
          <tbody>
            {L.map((l, i) => (
              <tr key={l.id} className={l.kind === 'copper' ? `cu${calc.layerId === l.id ? ' sel' : ''}` : 'di'}>
                {l.kind === 'copper'
                  ? <CopperRow l={l} unit={unit} selected={calc.layerId === l.id} />
                  : <DielectricRow l={l} unit={unit} />}
                <td className="act">
                  <button type="button" className="icon" title="Move up" aria-label={`Move ${l.id} up`} disabled={i === 0} onClick={() => dispatch({ type: 'moveLayer', id: l.id, dir: 'up' })}>&uarr;</button>
                  <button type="button" className="icon" title="Move down" aria-label={`Move ${l.id} down`} disabled={i === L.length - 1} onClick={() => dispatch({ type: 'moveLayer', id: l.id, dir: 'down' })}>&darr;</button>
                  <button type="button" className="icon" title="Insert copper after" aria-label={`Insert copper after ${l.id}`} onClick={() => dispatch({ type: 'addLayer', after: l.id, kind: 'copper' })}>+Cu</button>
                  <button type="button" className="icon" title="Insert dielectric after" aria-label={`Insert dielectric after ${l.id}`} onClick={() => dispatch({ type: 'addLayer', after: l.id, kind: 'dielectric' })}>+Di</button>
                  <button type="button" className="icon danger" title="Remove" aria-label={`Remove ${l.id}`} onClick={() => dispatch({ type: 'removeLayer', id: l.id })}>&times;</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Click a copper layer to calculate on it.</p>

      {errors.length > 0 && (
        <ul className="issues" role="alert">
          {errors.map((e, i) => <li key={i}>{e.msg}{e.layerId ? ` (${e.layerId})` : ''}</li>)}
        </ul>
      )}

      <h3>Solder mask</h3>
      <div className="maskgrid">
        {(['top', 'bottom'] as const).map((side) => {
          const m = side === 'top' ? stackup.maskTop : stackup.maskBottom;
          return (
            <fieldset key={side}>
              <legend>{side === 'top' ? 'Top' : 'Bottom'}</legend>
              <label>Thickness <LenInput valueMm={m.t} unit={unit} aria-label={`Mask ${side} thickness`} onChangeMm={(t) => dispatch({ type: 'setMask', side, patch: { t } })} /></label>
              <label>&epsilon;r <NumInput value={m.er} aria-label={`Mask ${side} er`} onChange={(er) => dispatch({ type: 'setMask', side, patch: { er } })} /></label>
              <label>tan&delta; <NumInput value={m.tand} aria-label={`Mask ${side} tand`} onChange={(tand) => dispatch({ type: 'setMask', side, patch: { tand } })} /></label>
            </fieldset>
          );
        })}
      </div>
      <p className="hint">0 = no mask.</p>

      <h3>Etch</h3>
      <div className="row">
        <label>Profile
          <select value={stackup.etch.mode} onChange={(e) => dispatch({ type: 'setEtch', patch: { mode: e.target.value as 'rect' | 'trap' } })}>
            <option value="rect">Rectangular</option><option value="trap">Trapezoidal</option>
          </select>
        </label>
        <RuleEditor rule={stackup.etch.rule} onChange={(rule) => dispatch({ type: 'setEtch', patch: { rule } })} label="Etch rule" />
      </div>
      <details className="more">
        <summary>More</summary>
        <p className="hint">
          Placeholder rule of thumb &mdash; use your fab&rsquo;s value. Fraction: top width = W &minus; value&middot;T.
          Factor: top width = W &minus; 2T/EF. Per-layer overrides are set in the layer rows.
        </p>
      </details>

      <h3>Files and sharing</h3>
      <div className="row wrap">
        <button type="button" onClick={save}>Save</button>
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Saved stackups">
          <option value="">Saved stackups&hellip;</option>
          {Object.keys(saved).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" onClick={load} disabled={!pick}>Load</button>
        <button type="button" onClick={del} disabled={!pick}>Delete</button>
      </div>
      <div className="row wrap">
        <button type="button" onClick={() => file.current?.click()}>Import JSON</button>
        <input ref={file} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
        {onImportKicad && <button type="button" onClick={onImportKicad}>Import KiCad&hellip;</button>}
        <button type="button" onClick={exportJson}>Export JSON</button>
        <button type="button" onClick={() => void share()}>Share link</button>
        <button type="button" onClick={() => { if (window.confirm('Replace the current stackup with the example?')) dispatch({ type: 'resetExample' }); }}>Reset to example</button>
      </div>
      {msg && <p className="hint" role="status">{msg}</p>}
    </section>
  );
}

function RuleEditor({ rule, onChange, label }: { rule: EtchRule; onChange: (r: EtchRule) => void; label: string }) {
  return (
    <span className="rule">
      <select aria-label={`${label} kind`} value={rule.by} onChange={(e) => onChange({ by: e.target.value as EtchRule['by'], value: e.target.value === 'fraction' ? 0.7 : 4 })}>
        <option value="fraction">fraction of T</option><option value="factor">etch factor</option>
      </select>
      <NumInput value={rule.value} aria-label={`${label} value`} onChange={(value) => onChange({ ...rule, value })} />
    </span>
  );
}

function CopperRow({ l, unit, selected }: { l: CopperLayer; unit: Unit; selected: boolean }) {
  const { state, dispatch } = useStore();
  const stackup = state.stackup;
  return (
    <>
      <td>
        <input className="name" aria-label={`Name of ${l.id}`} value={l.name}
          onChange={(e) => dispatch({ type: 'updateLayer', id: l.id, patch: { name: e.target.value } })} />
        <button type="button" className={`pill${selected ? ' on' : ''}`} onClick={() => dispatch({ type: 'selectLayer', id: l.id })}
          aria-pressed={selected} title="Calculate on this layer">{selected ? 'selected' : 'select'}</button>
      </td>
      <td>
        <select aria-label={`Role of ${l.id}`} value={l.role} onChange={(e) => dispatch({ type: 'updateLayer', id: l.id, patch: { role: e.target.value as Role } })}>
          <option value="signal">signal</option><option value="plane">plane</option><option value="mixed">mixed</option>
        </select>
      </td>
      <td><LenInput valueMm={l.t} unit={unit} aria-label={`Thickness of ${l.id}`} onChangeMm={(t) => dispatch({ type: 'updateLayer', id: l.id, patch: { t } })} /></td>
      <td colSpan={3} className="cuopts">
        <label className="inl">Etched on
          <select aria-label={`Base of ${l.id}`} value={l.base ?? 'auto'} onChange={(e) => dispatch({ type: 'updateLayer', id: l.id, patch: { base: e.target.value as 'auto' | 'above' | 'below' } })}>
            <option value="auto">auto</option><option value="above">dielectric above</option><option value="below">dielectric below</option>
          </select>
        </label>
        <label className="inl">
          <input type="checkbox" checked={!!l.etchOverride}
            onChange={(e) => dispatch({ type: 'updateLayer', id: l.id, patch: { etchOverride: e.target.checked ? { ...stackup.etch.rule } : undefined } })} />
          own etch rule
        </label>
        {l.etchOverride && <RuleEditor rule={l.etchOverride} label={`Etch rule of ${l.id}`} onChange={(etchOverride) => dispatch({ type: 'updateLayer', id: l.id, patch: { etchOverride } })} />}
      </td>
    </>
  );
}

function DielectricRow({ l, unit }: { l: DielectricLayer; unit: Unit }) {
  const { dispatch } = useStore();
  return (
    <>
      <td>
        <input className="name" aria-label={`Name of ${l.id}`} value={l.material}
          onChange={(e) => dispatch({ type: 'updateLayer', id: l.id, patch: { material: e.target.value, materialId: undefined } })} />
      </td>
      <td>
        <select aria-label={`Type of ${l.id}`} value={l.type} onChange={(e) => dispatch({ type: 'updateLayer', id: l.id, patch: { type: e.target.value as 'core' | 'prepreg' } })}>
          <option value="core">core</option><option value="prepreg">prepreg</option>
        </select>
      </td>
      <td><LenInput valueMm={l.t} unit={unit} aria-label={`Thickness of ${l.id}`} onChangeMm={(t) => dispatch({ type: 'updateLayer', id: l.id, patch: { t } })} /></td>
      <td>
        <MaterialPicker type={l.type} materialId={l.materialId} label={l.id}
          onPick={(m) => dispatch({ type: 'updateLayer', id: l.id, patch: { materialId: m.id, er: m.er, tand: m.tand } })} />
      </td>
      <td><NumInput value={l.er} aria-label={`er of ${l.id}`} onChange={(er) => dispatch({ type: 'updateLayer', id: l.id, patch: { er } })} /></td>
      <td><NumInput value={l.tand} aria-label={`tand of ${l.id}`} onChange={(tand) => dispatch({ type: 'updateLayer', id: l.id, patch: { tand } })} /></td>
    </>
  );
}
