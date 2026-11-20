import type { CopperLayer, Role, Stackup } from '../model/stackup';

export function RoleReview({ stackup, warnings, onChange, onConfirm, onCancel }: {
  stackup: Stackup;
  warnings: string[];
  onChange: (next: Stackup) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const coppers = stackup.layers.filter((l): l is CopperLayer => l.kind === 'copper');
  const setRole = (id: string, role: Role) =>
    onChange({ ...stackup, layers: stackup.layers.map((l) => (l.kind === 'copper' && l.id === id ? { ...l, role } : l)) });
  return (
    <div>
      <h4>Review layer roles</h4>
      <p className="hint">Imported roles may be wrong. Check each copper layer.</p>
      <table>
        <thead><tr><th>Layer</th><th>Imported role</th><th>Thickness (mm)</th></tr></thead>
        <tbody>
          {coppers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>
                <select aria-label={`Role of ${c.name}`} value={c.role} onChange={(e) => setRole(c.id, e.target.value as Role)}>
                  <option value="signal">signal</option>
                  <option value="plane">plane</option>
                  <option value="mixed">mixed</option>
                </select>
              </td>
              <td>{c.t}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {warnings.length > 0 && (
        <>
          <h4>Import notes</h4>
          <ul className="issues" aria-label="Import warnings">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </>
      )}
      <div className="row wrap">
        <button type="button" className="pill on" onClick={onConfirm}>Use this stackup</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
