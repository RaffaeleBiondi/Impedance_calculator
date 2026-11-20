import { useState } from 'react';
import type { Material } from '../model/materials';
import { PRESETS } from '../model/materials';
import { materialsApi, useUserMaterials } from './materialsStore';
import { NumInput } from './NumInput';

/** Select a material for a dielectric row; picking fills er/tand (which stay editable). */
export function MaterialPicker({ type, materialId, label, onPick }: {
  type: 'core' | 'prepreg'; materialId?: string; label: string; onPick: (m: Material) => void;
}) {
  const user = useUserMaterials();
  const [open, setOpen] = useState(false);
  const all = [...PRESETS, ...user];
  const usable = all.filter((m) => m.type === 'either' || m.type === type || m.id === materialId);
  return (
    <span className="matpick">
      <select
        aria-label={`Material, ${label}`} value={materialId ?? ''}
        onChange={(e) => { const m = all.find((x) => x.id === e.target.value); if (m) onPick(m); }}
      >
        <option value="">Custom</option>
        {usable.map((m) => <option key={m.id} value={m.id} title={m.freq}>{m.name}</option>)}
      </select>
      <button type="button" className="icon" title="Material library" aria-label="Open material library" onClick={() => setOpen(true)}>Lib</button>
      {open && <MaterialLibrary onClose={() => setOpen(false)} />}
    </span>
  );
}

export function MaterialLibrary({ onClose }: { onClose: () => void }) {
  const user = useUserMaterials();
  const [edit, setEdit] = useState<Material | null>(null);
  const blank = (): Material => ({
    id: materialsApi.newId(), name: '', family: '', type: 'either', er: 4, tand: 0.02, freq: '', source: '', preset: false,
  });
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Material library">
      <div className="dialog">
        <header>
          <h3>Material library</h3>
          <button type="button" onClick={onClose} aria-label="Close">Close</button>
        </header>
        <div className="tablewrap">
          <table className="mat">
            <thead><tr><th>Name</th><th>Type</th><th>&epsilon;r</th><th>tan&delta;</th><th>Source</th><th /></tr></thead>
            <tbody>
              {[...PRESETS, ...user].map((m) => (
                <tr key={m.id}>
                  <td>{m.name}{m.preset ? '' : ' *'}<div className="sub" title={m.freq}>{m.freq}</div></td><td>{m.type}</td><td>{m.er}</td><td>{m.tand}</td>
                  <td className="src">{m.source}</td>
                  <td className="act">
                    {m.preset
                      ? <button type="button" onClick={() => setEdit(materialsApi.duplicate(m))}>Duplicate</button>
                      : <>
                        <button type="button" onClick={() => setEdit(m)}>Edit</button>
                        <button type="button" onClick={() => materialsApi.removeUser(m.id)}>Delete</button>
                      </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">* user material (this browser only). Duplicate a preset to edit.</p>
        {edit ? (
          <MaterialForm m={edit} onCancel={() => setEdit(null)} onSave={(m) => { materialsApi.saveUser(m); setEdit(null); }} />
        ) : (
          <button type="button" onClick={() => setEdit(blank())}>Add material</button>
        )}
      </div>
    </div>
  );
}

function MaterialForm({ m, onSave, onCancel }: { m: Material; onSave: (m: Material) => void; onCancel: () => void }) {
  const [d, setD] = useState<Material>(m);
  const set = (p: Partial<Material>) => setD((x) => ({ ...x, ...p }));
  const ok = d.name.trim() !== '' && d.er >= 1 && d.tand >= 0;
  return (
    <form className="matform" onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ ...d, name: d.name.trim() }); }}>
      <label>Name <input value={d.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <label>Family <input value={d.family} onChange={(e) => set({ family: e.target.value })} /></label>
      <label>Type
        <select value={d.type} onChange={(e) => set({ type: e.target.value as Material['type'] })}>
          <option value="core">core</option><option value="prepreg">prepreg</option><option value="either">either</option>
        </select>
      </label>
      <label>&epsilon;r <NumInput value={d.er} onChange={(v) => set({ er: v })} aria-label="Material er" /></label>
      <label>tan&delta; <NumInput value={d.tand} onChange={(v) => set({ tand: v })} aria-label="Material tand" /></label>
      <label>Frequency <input value={d.freq} onChange={(e) => set({ freq: e.target.value })} placeholder="e.g. 1 GHz" /></label>
      <label>Source <input value={d.source} onChange={(e) => set({ source: e.target.value })} placeholder="datasheet, table, page" /></label>
      <div className="row">
        <button type="submit" disabled={!ok}>Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
