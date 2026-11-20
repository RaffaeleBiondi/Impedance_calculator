import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { usePool } from './usePool';
import { LenInput } from './LenInput';
import { NumInput } from './NumInput';
import { buildReq } from './reqs';
import { coppers, defaultRefs } from '../model/stackup';
import { formatLen, toDisplay } from '../model/units';
import { mainFailText, widthTableCsv, type CellResult, type WidthRow } from '../io/csv';
import { failText, signedPct } from './synthText';
import type { ImpClass } from '../state/types';
import type { GapRule } from '../model/gapRule';
import type { Job } from '../solver/protocol';

type Refs = { above: string | null; below: string | null };
const EPS = 1e-9;
type Cell = CellResult;

/** Failure text built from the structured result, in the display unit with Ω. */
function Fail({ c, text }: { c: Cell; text: string }) {
  if (c.ok) return null;
  return (
    <>
      {text}
      {c.detail && <details className="more"><summary>Why?</summary>{c.detail}</details>}
    </>
  );
}

const RULE_LABEL: Record<GapRule['kind'], string> = {
  'compact-at-target': 'Compact at target', 'fixed-gap': 'Fixed gap', 'fixed-pitch': 'Fixed pitch',
};

function ruleOf(kind: GapRule['kind'], prev: GapRule, fmin: number): GapRule {
  if (kind === 'compact-at-target') return { kind };
  if (kind === 'fixed-gap') return { kind, gap: prev.kind === 'fixed-gap' ? prev.gap : 0.2 };
  return { kind, pitch: prev.kind === 'fixed-pitch' ? prev.pitch : Math.max(0.44, 3 * fmin) };
}

const foot = (c: CellResult, diff: boolean) => (!c.ok ? NaN : diff ? 2 * c.W + (c.S ?? 0) : c.W);

export function WidthTable() {
  const { state, dispatch, stackupRev } = useStore();
  const pool = usePool();
  const { classes, tableLayers, stackup, unit, calc } = state;
  const cus = coppers(stackup);
  const [overrides, setOverrides] = useState<Record<string, Refs>>({});
  // Reference overrides are keyed by layer id, which means nothing in a replaced stackup.
  useEffect(() => { setOverrides({}); }, [stackupRev]);
  const [rows, setRows] = useState<WidthRow[] | null>(null);
  const [prog, setProg] = useState<[number, number] | null>(null);
  const [err, setErr] = useState('');
  const cancelRef = useRef<(() => void) | null>(null);
  const running = prog !== null;

  const refsOf = (id: string): Refs => overrides[id] ?? defaultRefs(stackup, id);

  // any input change invalidates results (and aborts a running batch)
  const sig = useMemo(
    () => JSON.stringify([classes, tableLayers, overrides, calc.fmin, calc.tol, calc.q, calc.freqGHz, stackup]),
    [classes, tableLayers, overrides, calc.fmin, calc.tol, calc.q, calc.freqGHz, stackup],
  );
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    cancelRef.current?.();
    setRows(null); setErr('');
  }, [sig]);
  useEffect(() => () => cancelRef.current?.(), []);

  const setClass = (id: string, patch: Partial<ImpClass>) =>
    dispatch({ type: 'setClasses', classes: classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addClass = () => {
    let k = classes.length + 1;
    while (classes.some((c) => c.id === `cls-${k}`)) k++;
    dispatch({
      type: 'setClasses',
      classes: [...classes, { id: `cls-${k}`, name: `Class ${k}`, type: 'se', target: 50, rule: { kind: 'compact-at-target' }, G: null }],
    });
  };
  const toggleLayer = (id: string) => dispatch({
    type: 'setTableLayers', ids: tableLayers.includes(id) ? tableLayers.filter((t) => t !== id) : cus.map((c) => c.id).filter((c) => c === id || tableLayers.includes(c)),
  });

  const layers = cus.filter((c) => tableLayers.includes(c.id));
  const canRun = !running && classes.length > 0 && layers.length > 0;

  const run = () => {
    const meta: { cls: ImpClass; layerName: string }[] = [];
    const jobs: Job[] = [];
    for (const cls of classes) {
      for (const l of layers) {
        const r = refsOf(l.id);
        const req = buildReq(state, { layerId: l.id, refAbove: r.above, refBelow: r.below },
          { type: cls.type, W: calc.W, S: calc.S, G: cls.G });
        jobs.push({ op: 'tableCell', req, target: cls.target, rule: cls.rule, fmin: calc.fmin, tol: calc.tol / 100 });
        meta.push({ cls, layerName: l.name });
      }
    }
    setErr(''); setRows(null); setProg([0, jobs.length]);
    const h = pool.runBatch<{ main: Cell; compact: Cell }>(jobs, (d, t) => setProg([d, t]));
    cancelRef.current = h.cancel;
    h.promise
      .then((rs) => setRows(rs.map((r, i) => ({ ...meta[i], main: r.main, compact: r.compact }))))
      .catch((e) => { if (e !== 'cancelled') setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { setProg(null); cancelRef.current = null; });
  };

  const download = () => {
    if (!rows) return;
    const blob = new Blob([widthTableCsv(rows, unit, calc.fmin)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lordoftheohms-widths.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const len = (v: number | undefined) => (v === undefined ? '' : String(parseFloat(toDisplay(v, unit).toFixed(4))));
  const tolTxt = `±${calc.tol}%`;

  return (
    <div className="widthtable">
      <h3>Width table</h3>
      <div className="tablewrap">
        <table className="classes">
          <thead><tr><th>Name</th><th>Type</th><th>Target (Ω)</th><th>Rule</th><th>Value</th><th title="Coplanar gap (optional)">G</th><th /></tr></thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td><input className="name" value={c.name} aria-label={`Name of ${c.id}`} onChange={(e) => setClass(c.id, { name: e.target.value })} /></td>
                <td>
                  <select value={c.type} aria-label={`Type of ${c.name}`} onChange={(e) => setClass(c.id, { type: e.target.value as 'se' | 'diff' })}>
                    <option value="se">SE</option><option value="diff">Diff</option>
                  </select>
                </td>
                <td><NumInput value={c.target} aria-label={`Target of ${c.name}`} onChange={(v) => v > 0 && setClass(c.id, { target: v })} /></td>
                <td>
                  <select value={c.rule.kind} aria-label={`Rule of ${c.name}`} onChange={(e) => setClass(c.id, { rule: ruleOf(e.target.value as GapRule['kind'], c.rule, calc.fmin) })}>
                    {(Object.keys(RULE_LABEL) as GapRule['kind'][]).map((k) => <option key={k} value={k}>{RULE_LABEL[k]}</option>)}
                  </select>
                </td>
                <td>
                  {c.rule.kind === 'fixed-gap' && <LenInput valueMm={c.rule.gap} unit={unit} aria-label={`Gap of ${c.name}`} onChangeMm={(v) => v > 0 && setClass(c.id, { rule: { kind: 'fixed-gap', gap: v } })} />}
                  {c.rule.kind === 'fixed-pitch' && <LenInput valueMm={c.rule.pitch} unit={unit} aria-label={`Pitch of ${c.name}`} onChangeMm={(v) => v > 0 && setClass(c.id, { rule: { kind: 'fixed-pitch', pitch: v } })} />}
                </td>
                <td>
                  <input type="checkbox" checked={c.G !== null} aria-label={`Coplanar G of ${c.name}`} onChange={(e) => setClass(c.id, { G: e.target.checked ? 0.2 : null })} />
                  {c.G !== null && <LenInput valueMm={c.G} unit={unit} aria-label={`G value of ${c.name}`} onChangeMm={(v) => v > 0 && setClass(c.id, { G: v })} />}
                </td>
                <td className="act"><button type="button" className="icon danger" aria-label={`Remove ${c.name}`} onClick={() => dispatch({ type: 'setClasses', classes: classes.filter((x) => x.id !== c.id) })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row wrap">
        <button type="button" onClick={addClass}>Add class</button>
      </div>

      <fieldset className="layerpick">
        <legend>Layers</legend>
        {cus.map((l) => {
          const on = tableLayers.includes(l.id);
          const r = refsOf(l.id);
          const opts = cus.filter((x) => x.id !== l.id);
          const sel = (side: 'above' | 'below') => (
            <select value={r[side] ?? ''} aria-label={`Ref ${side} of ${l.name}`} onChange={(e) => setOverrides({ ...overrides, [l.id]: { ...r, [side]: e.target.value || null } })}>
              <option value="">–</option>
              {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          );
          return (
            <span className="lp" key={l.id}>
              <label className="inl"><input type="checkbox" checked={on} aria-label={`Include ${l.name}`} onChange={() => toggleLayer(l.id)} />{l.name}</label>
              {on && <details className="more"><summary>refs</summary>{sel('above')}{sel('below')}</details>}
            </span>
          );
        })}
      </fieldset>

      <div className="row wrap">
        {running
          ? <button type="button" onClick={() => cancelRef.current?.()}>Cancel</button>
          : <button type="button" disabled={!canRun} onClick={run}>Run table</button>}
        {running && prog && <progress value={prog[0]} max={prog[1]} aria-label="Table progress" />}
        {rows && <button type="button" onClick={download}>Download CSV</button>}
      </div>
      {err && <p className="hint warn" role="status">{err}</p>}

      {rows && (
        <div className="tablewrap">
          <table data-testid="width-grid" className="grid">
            <thead>
              <tr>
                <th>Class</th><th>Layer</th><th>W ({unit})</th><th>Gap ({unit})</th><th>Z (Ω)</th><th>Dev</th><th />
                <th title={`Narrowest W, or smallest 2W+S, with Z inside target ${tolTxt}. Z sits on the tolerance edge.`}>Most compact {tolTxt}</th>
                <th>W</th><th>Gap</th><th>Z (Ω)</th><th>Saved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const m = r.main as Cell, c = r.compact as Cell, diff = r.cls.type === 'diff';
                const below = m.ok && (m.W < calc.fmin - EPS || (m.S !== undefined && m.S < calc.fmin - EPS));
                const fm = foot(m, diff), fc = foot(c, diff);
                const saved = Number.isFinite(fm) && Number.isFinite(fc) && fm > 0 ? ((fm - fc) / fm) * 100 : null;
                return (
                  <tr key={i}>
                    <td>{r.cls.name}</td><td>{r.layerName}</td>
                    {m.ok ? (
                      <>
                        <td>{len(m.W)}</td><td>{len(m.S)}</td><td>{m.z.toFixed(2)}</td>
                        <td>{signedPct(((m.z - r.cls.target) / r.cls.target) * 100, 2)}%</td>
                        <td className={below ? 'warn' : ''} title={below ? `Below fab minimum ${formatLen(calc.fmin, unit)}` : 'Meets fab minimum'}>{below ? '⚠' : '✓'}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="warn"><Fail c={m} text={m.ok ? '' : mainFailText(m, r.cls, unit, calc.fmin)} /></td>
                    )}
                    {c.ok ? (
                      <>
                        <td />
                        <td>{len(c.W)}</td><td>{len(c.S)}</td><td>{c.z.toFixed(2)}</td>
                        <td>{saved === null ? '' : `${signedPct(saved, 0)}%`}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="warn"><Fail c={c} text={c.ok ? '' : failText(c, { op: 'compact', target: r.cls.target, tolPct: calc.tol, fmin: calc.fmin, W: calc.W, unit })} /></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
