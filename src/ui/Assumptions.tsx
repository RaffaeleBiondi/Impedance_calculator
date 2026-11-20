import data from '../validation.json';

export interface ValidationRow {
  id: string; test: string; reference: string; result: string; acceptance: string;
  status: 'pass' | 'deviation-recorded' | 'not-validated';
}
const rows = data as ValidationRow[];

const STATUS: Record<ValidationRow['status'], { label: string; cls: string }> = {
  pass: { label: 'Pass', cls: 'status-pass' },
  'deviation-recorded': { label: 'Deviation recorded', cls: 'status-dev' },
  'not-validated': { label: 'Not validated', cls: 'status-nv' },
};

export const NOTES: { title: string; text: string }[] = [
  { title: 'Thickness convention', text: 'Copper thickness is the finished (plated) thickness entered per layer. Dielectric thicknesses are the pressed values between copper surfaces, so the total follows from the sum of all layers.' },
  { title: 'Solver method', text: 'The cross-section is solved with a finite-volume discretisation of Laplace\'s equation on a graded rectilinear grid, using a preconditioned conjugate-gradient solver. Capacitance comes from the stored field energy, symmetry walls halve the domain where the geometry allows, and Richardson extrapolation between two mesh densities reduces the discretisation error.' },
  { title: 'Compact geometry', text: 'The most compact solution that meets the target tolerance sits on a corner of the allowed region: at the edge of the tolerance there is no margin left for fabrication variation. Check the result against your fabricator\'s process tolerances before relying on it.' },
  { title: 'Quasi-static, solid planes', text: 'Results are quasi-static (TEM) estimates. Reference planes are treated as solid and infinite; voids, slots, split planes, via fences and glass-weave effects are not modelled. Skin effect and conductor roughness are not included.' },
  { title: 'Trapezoid etch profile', text: 'The trapezoid reduction (default W - W_top = 0.7 x copper thickness) is a rule of thumb. Ask your fabricator for the real etch factor.' },
  { title: 'Solder mask', text: 'Solder mask is modelled as a conformal layer of uniform thickness and permittivity over the outer copper. Real mask thickness varies over traces and between processes, so treat the mask contribution as approximate.' },
];

export function Assumptions() {
  return (
    <div>
      <h3>Assumptions</h3>
      <ul className="notes">
        {NOTES.map((n) => <li key={n.title}><strong>{n.title}.</strong> {n.text}</li>)}
      </ul>
      <h3>Validation</h3>
      {rows.length === 0 ? (
        <p className="hint">Validation results will appear here.</p>
      ) : (
        <div className="tablewrap">
          <table aria-label="Validation results">
            <thead><tr><th>Test</th><th>Reference</th><th>Result</th><th>Acceptance</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.test}</td><td>{r.reference}</td><td>{r.result}</td><td>{r.acceptance}</td>
                  <td className={STATUS[r.status].cls}>{STATUS[r.status].label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
