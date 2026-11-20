import { useState } from 'react';
import { useStore } from '../state/store';
import type { Stackup } from '../model/stackup';
import { importKicadStackup } from '../io/kicad';
import { parseStackupJson } from '../io/json';
import { RoleReview } from './RoleReview';

function readText(f: File): Promise<string> {
  if (typeof f.text === 'function') return f.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(f);
  });
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore();
  const [errors, setErrors] = useState<string[]>([]);
  const [review, setReview] = useState<{ stackup: Stackup; warnings: string[] } | null>(null);

  const onFile = async (f: File) => {
    setErrors([]); setReview(null);
    let text: string;
    try { text = await readText(f); } catch { setErrors(['Could not read the file.']); return; }
    if (/\.json$/i.test(f.name)) {
      const r = parseStackupJson(text);
      if (r.ok) { dispatch({ type: 'setStackup', stackup: r.stackup }); onClose(); }
      else setErrors(r.errors);
      return;
    }
    const r = importKicadStackup(text);
    if (r.ok) setReview({ stackup: r.stackup, warnings: r.warnings });
    else setErrors([r.error]);
  };

  const confirm = () => {
    if (!review) return;
    dispatch({ type: 'setStackup', stackup: review.stackup });
    onClose();
  };

  return (
    <div className="overlay" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Import stackup">
        <header>
          <h3>Import a stackup</h3>
          <button type="button" onClick={onClose} aria-label="Close">Close</button>
        </header>
        <p className="hint">
          Choose a KiCad board (.kicad_pcb, KiCad 6 to 9) or a stackup JSON file. The file is read in your browser and never uploaded.
        </p>
        <input type="file" aria-label="Stackup file" accept=".kicad_pcb,.json,application/json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
        {errors.length > 0 && (
          <ul className="issues" role="alert" aria-label="Import errors">{errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        )}
        {review && (
          <RoleReview stackup={review.stackup} warnings={review.warnings}
            onChange={(s) => setReview({ ...review, stackup: s })} onConfirm={confirm} onCancel={onClose} />
        )}
      </div>
    </div>
  );
}
