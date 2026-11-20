import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { usePool } from './usePool';
import { LenInput } from './LenInput';
import { SweepChart, type SweepPoint } from './SweepChart';
import { buildReq } from './reqs';
import { displayText } from './synthText';
import type { AnalyzeResult } from '../solver/engine';

const zOf = (r: AnalyzeResult): number | null => (!r.ok ? null : r.kind === 'se' ? r.r.Z0 : r.r.Zdiff);

export function Sweep() {
  const { state, stackupRev } = useStore();
  const pool = usePool();
  const c = state.calc;
  const [param, setParam] = useState<'W' | 'S'>('W');
  const [from, setFrom] = useState(() => c.W * 0.5);
  const [to, setTo] = useState(() => c.W * 2);
  const [n, setN] = useState(15);
  const [pts, setPts] = useState<SweepPoint[]>([]);
  const [prog, setProg] = useState<[number, number] | null>(null);
  const [err, setErr] = useState('');
  const cancelRef = useRef<(() => void) | null>(null);
  const running = prog !== null;

  useEffect(() => () => cancelRef.current?.(), []);

  const pick = (p: 'W' | 'S') => {
    setParam(p);
    const base = p === 'W' ? c.W : c.S;
    setFrom(base * 0.5); setTo(base * 2);
  };

  // A gap sweep needs a pair: back to W (re-based) when the line becomes single-ended.
  useEffect(() => { if (c.type === 'se' && param === 'S') pick('W'); }, [c.type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any change to what the curve was computed for, or a stackup replacement, drops it (and aborts a running sweep), as in the width table.
  // The swept dimension itself is not part of it: its calculator value is replaced by the sweep values.
  const fixed = param === 'W' ? (c.type === 'diff' ? c.S : null) : c.W;
  const gG = c.cpw ? c.G : null;
  const sig = useMemo(
    () => JSON.stringify([stackupRev, state.stackup, c.layerId, c.refAbove, c.refBelow, c.type, gG, fixed, c.q, param]),
    [stackupRev, state.stackup, c.layerId, c.refAbove, c.refBelow, c.type, gG, fixed, c.q, param],
  );
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    cancelRef.current?.();
    setPts([]); setErr('');
  }, [sig]);

  const run = () => {
    const count = Math.max(2, Math.min(200, Math.round(n) || 2));
    const req = buildReq(state, { layerId: c.layerId, refAbove: c.refAbove, refBelow: c.refBelow },
      { type: c.type, W: c.W, S: c.S, G: c.cpw ? c.G : null });
    const xs = Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
    const jobs = xs.map((value) => ({ op: 'sweepPoint' as const, req, param, value }));
    setErr(''); setPts([]); setProg([0, count]);
    const h = pool.runBatch<AnalyzeResult>(jobs, (d, t) => setProg([d, t]));
    cancelRef.current = h.cancel;
    h.promise
      .then((rs) => {
        setPts(xs.map((x, i) => ({ x, z: zOf(rs[i]) })));
        const bad = rs.find((r) => !r.ok);
        if (bad && !bad.ok) setErr(displayText(bad.error, state.unit));
      })
      .catch((e) => { if (e !== 'cancelled') setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { setProg(null); cancelRef.current = null; });
  };

  const cancel = () => { cancelRef.current?.(); };
  const gapOk = c.type === 'diff';

  return (
    <div className="sweep">
      <h3>Sweep</h3>
      <div className="row wrap">
        <label>Parameter
          <select value={param} aria-label="Sweep parameter" onChange={(e) => pick(e.target.value as 'W' | 'S')}>
            <option value="W">W</option>
            <option value="S" disabled={!gapOk}>Gap</option>
          </select>
        </label>
        <label>From <LenInput valueMm={from} unit={state.unit} onChangeMm={setFrom} aria-label="Sweep from" /></label>
        <label>To <LenInput valueMm={to} unit={state.unit} onChangeMm={setTo} aria-label="Sweep to" /></label>
        <label>N
          <input type="number" min={2} max={200} value={n} aria-label="Sweep points" className="n"
            onChange={(e) => setN(Number(e.target.value))} />
        </label>
        {running
          ? <button type="button" onClick={cancel}>Cancel</button>
          : <button type="button" onClick={run}>Run sweep</button>}
        {running && prog && <progress value={prog[0]} max={prog[1]} aria-label="Sweep progress" />}
      </div>
      {err && <p className="hint warn" role="status">{err}</p>}
      <SweepChart points={pts} target={c.target} tolPct={c.tol} fmin={c.fmin} unit={state.unit} xName={param === 'W' ? 'W' : 'Gap'} />
    </div>
  );
}
