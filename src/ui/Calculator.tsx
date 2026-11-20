import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { AppState, CalcState } from '../state/types';
import { coppers } from '../model/stackup';
import { fromDisplay, toDisplay, type Unit } from '../model/units';
import type { AnalyzeRequest, AnalyzeResult } from '../solver/engine';
import type { Job } from '../solver/protocol';
import type { SynthResult } from '../solver/synthesis';
import { buildReq } from './reqs';
import { usePool } from './usePool';
import { LenInput } from './LenInput';
import { NumInput } from './NumInput';
import { Results } from './Results';
import { unitSuffix } from './lenText';

/** Worker reply for findW / findS (SynthResult) and compact (compactWithinTol adds a message on success). */
type Synth = SynthResult & { message?: string };

export const DEBOUNCE_MS = 180;

/** Round step per display unit (stored in mm): 0.005 mm, 5 µm, 0.1 mil. */
export const ROUND_STEP: Record<Unit, number> = { mm: 0.005, um: 0.005, mil: 0.00254 };

/** The calculator's AnalyzeRequest (S only for pairs, G only with coplanar GND). */
export function buildRequest(s: AppState): AnalyzeRequest {
  const c = s.calc;
  return buildReq(s, { layerId: c.layerId, refAbove: c.refAbove, refBelow: c.refBelow },
    { type: c.type, W: c.W, S: c.S, G: c.cpw ? c.G : null });
}

type Line = { W: number; S?: number; G?: number | null };
const lineOf = (r: AnalyzeRequest, W = r.line.W, S = r.line.S): Line =>
  ({ W, S: r.line.type === 'diff' ? S : undefined, G: r.line.G ?? null });

interface Msg { text: string; detail?: string; cls: 'ok' | 'bad' }

/** Optional length (empty = none), shown in the display unit, stored in mm. */
function OptLen({ valueMm, unit, onChangeMm, label }: { valueMm: number | null; unit: Unit; onChangeMm: (v: number | null) => void; label: string }) {
  const show = (v: number | null) => (v == null ? '' : String(parseFloat(toDisplay(v, unit).toFixed(4))));
  const [text, setText] = useState(() => show(valueMm));
  const last = useRef({ valueMm, unit });
  useEffect(() => {
    const unitChanged = last.current.unit !== unit;
    last.current = { valueMm, unit };
    const t = text.trim();
    const cur = t === '' ? null : fromDisplay(Number(t.replace(',', '.')), unit);
    if (!unitChanged && cur === valueMm) return;
    setText(show(valueMm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMm, unit]);
  return (
    <input
      type="text" inputMode="decimal" className="len" aria-label={label} placeholder="–" value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') { onChangeMm(null); return; }
        const v = Number(t.replace(',', '.'));
        if (Number.isFinite(v) && v >= 0) onChangeMm(fromDisplay(v, unit));
      }}
      onBlur={() => setText(show(valueMm))}
    />
  );
}

export function Calculator() {
  const { state, dispatch } = useStore();
  const pool = usePool();
  const { stackup, calc, unit } = state;
  const [msg, setMsg] = useState<Msg | null>(null);
  const [shown, setShown] = useState<{ result: AnalyzeResult; line: Line } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const handle = useRef<{ cancel(): void } | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (patch: Partial<CalcState>) => dispatch({ type: 'setCalc', patch });
  const edit = (patch: Partial<CalcState>) => { setMsg(null); set(patch); };

  const L = stackup.layers;
  const cus = coppers(stackup);
  const idx = (id: string) => L.findIndex((l) => l.id === id);
  const li = idx(calc.layerId);
  const layerOpts = cus.filter((c) => c.role !== 'plane' || c.id === calc.layerId);
  const aboveOpts = cus.filter((c) => idx(c.id) < li);
  const belowOpts = cus.filter((c) => idx(c.id) > li);
  const cu = (id: string | null) => (id ? cus.find((c) => c.id === id) ?? null : null);
  const diff = calc.type === 'diff';
  const etch = stackup.etch.mode === 'trap';
  const u = unitSuffix(unit);

  const req = useMemo(() => buildRequest(state), [stackup, calc]); // eslint-disable-line react-hooks/exhaustive-deps
  // Compact mode: W and S are outputs, so they stay out of the key (writing them back must not re-run the search).
  const key = useMemo(
    () => JSON.stringify(calc.compact
      ? { ...req, line: { ...req.line, W: 0, S: 0 }, target: calc.target, tol: calc.tol, fmin: calc.fmin }
      : req),
    [req, calc.compact, calc.target, calc.tol, calc.fmin],
  );

  /** Run one job, superseding (cancelling) the previous one; stale replies are dropped. */
  const start = <T,>(job: Job, label: string, onOk: (res: T) => void) => {
    handle.current?.cancel();
    const my = ++seq.current;
    setBusy(label);
    const h = pool.run<T>(job);
    handle.current = h;
    h.promise
      .then((res) => { if (my === seq.current) onOk(res); })
      .catch((e: unknown) => {
        if (my !== seq.current || e === 'cancelled') return;
        setMsg({ text: `Calculation failed: ${e instanceof Error ? e.message : String(e)}`, cls: 'bad' });
      })
      .finally(() => { if (my === seq.current) { setBusy(null); handle.current = null; } });
  };

  useEffect(() => {
    const r = req, c = calc;
    const t = setTimeout(() => {
      timer.current = null;
      if (c.compact) {
        start<Synth>({ op: 'compact', req: r, target: c.target, tol: c.tol / 100, fmin: c.fmin }, 'compact…', (res) => {
          if (res.ok) {
            set(res.S != null && r.line.type === 'diff' ? { W: res.W, S: res.S } : { W: res.W });
            setShown({ result: res.result, line: lineOf(r, res.W, res.S ?? r.line.S) });
            if (res.message) setMsg({ text: res.message, cls: 'ok' });
          } else {
            setShown(null);
            setMsg({ text: res.message, detail: res.detail, cls: 'bad' });
          }
        });
      } else {
        start<AnalyzeResult>({ op: 'analyze', req: r }, '…', (res) => setShown({ result: res, line: lineOf(r) }));
      }
    }, DEBOUNCE_MS);
    timer.current = t;
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { seq.current++; handle.current?.cancel(); }, []);

  const synth = (op: 'findW' | 'findS') => {
    setMsg(null);
    const r = req, c = calc;
    // A pending debounced analysis would cancel the search: drop it (the search uses the same inputs).
    const hadPending = timer.current != null;
    if (timer.current != null) { clearTimeout(timer.current); timer.current = null; }
    start<Synth>({ op, req: r, target: c.target }, 'searching…', (res) => {
      if (!res.ok) {
        setMsg({ text: res.message, detail: res.detail, cls: 'bad' });
        // The dropped analysis still has to run for the edited inputs.
        if (hadPending) start<AnalyzeResult>({ op: 'analyze', req: r }, '…', (a) => setShown({ result: a, line: lineOf(r) }));
        return;
      }
      const v = op === 'findW' ? res.W : (res.S as number);
      const name = op === 'findW' ? 'W' : 'Gap';
      set(op === 'findW' ? { W: +v.toFixed(4) } : { S: +v.toFixed(4) });
      setShown({ result: res.result, line: lineOf(r, res.W, res.S ?? r.line.S) });
      const shownV = `${toDisplay(v, unit).toFixed(unit === 'mm' ? 4 : 2)} ${u}`;
      setMsg(v < c.fmin - 1e-9
        ? { text: `${name} ${shownV} is below the fab minimum`, cls: 'bad' }
        : { text: `${name} ${shownV} for ${+c.target.toFixed(2)} Ω`, cls: 'ok' });
    });
  };

  const round = () => {
    const st = ROUND_STEP[unit];
    const r = (v: number) => +(Math.round(v / st) * st).toFixed(6);
    edit({ W: r(calc.W), S: r(calc.S) });
  };

  const setType = (type: 'se' | 'diff') => {
    if (type === calc.type) return;
    let target = calc.target;
    if (type === 'diff' && target === 50) target = 100;
    if (type === 'se' && (target === 100 || target === 90)) target = 50;
    edit({ type, target });
  };

  const refWarn = (id: string | null) => cu(id)?.role === 'signal'
    ? <span className="warnicon" title="This reference has role signal, not plane" aria-label="Reference role is signal">⚠</span>
    : null;
  const searching = busy === 'searching…';
  const layer = cu(calc.layerId);

  return (
    <div className="calcbody">
      <div className="row wrap">
        <label>Layer
          <select aria-label="Signal layer" value={calc.layerId} onChange={(e) => { setMsg(null); dispatch({ type: 'selectLayer', id: e.target.value }); }}>
            {layerOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Ref above
          <span className="inl">
            <select aria-label="Reference above" value={calc.refAbove ?? ''} onChange={(e) => { setMsg(null); dispatch({ type: 'setRefs', above: e.target.value || null, below: calc.refBelow }); }}>
              <option value="">none</option>
              {aboveOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {refWarn(calc.refAbove)}
          </span>
        </label>
        <label>Ref below
          <span className="inl">
            <select aria-label="Reference below" value={calc.refBelow ?? ''} onChange={(e) => { setMsg(null); dispatch({ type: 'setRefs', above: calc.refAbove, below: e.target.value || null }); }}>
              <option value="">none</option>
              {belowOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {refWarn(calc.refBelow)}
          </span>
        </label>
      </div>

      <div className="row wrap">
        <div className="seg" role="group" aria-label="Line type">
          <button type="button" aria-pressed={!diff} onClick={() => setType('se')}>SE</button>
          <button type="button" aria-pressed={diff} onClick={() => setType('diff')}>Diff</button>
        </div>
        <div className="seg" role="group" aria-label="Trace profile">
          <button type="button" aria-pressed={!etch} onClick={() => { setMsg(null); dispatch({ type: 'setEtch', patch: { mode: 'rect' } }); }}>Rect</button>
          <button type="button" aria-pressed={etch} title="Etch rule from the stackup" onClick={() => { setMsg(null); dispatch({ type: 'setEtch', patch: { mode: 'trap' } }); }}>Trapezoid</button>
        </div>
        <label className="inl"><input type="checkbox" checked={calc.cpw} onChange={(e) => edit({ cpw: e.target.checked })} /> Coplanar GND</label>
        <label className="inl">Mesh
          <select aria-label="Mesh" value={calc.q} onChange={(e) => edit({ q: Number(e.target.value) === 2 ? 2 : 1 })}>
            <option value={1}>normal</option>
            <option value={2}>fine</option>
          </select>
        </label>
      </div>

      <div className="inputs">
        <label>W ({u})<LenInput aria-label="Width W" valueMm={calc.W} unit={unit} disabled={calc.compact} onChangeMm={(W) => W > 0 && edit({ W })} /></label>
        {diff && <label>S ({u})<LenInput aria-label="Gap S" valueMm={calc.S} unit={unit} disabled={calc.compact} onChangeMm={(S) => S > 0 && edit({ S })} /></label>}
        {calc.cpw && <label>G ({u})<LenInput aria-label="Coplanar gap G" valueMm={calc.G} unit={unit} onChangeMm={(G) => G > 0 && edit({ G })} /></label>}
        <label>Target (Ω)<NumInput aria-label="Target impedance" value={calc.target} onChange={(target) => target > 0 && edit({ target })} /></label>
        <label>Fab min ({u})<LenInput aria-label="Fab minimum" title="Minimum W and gap" valueMm={calc.fmin} unit={unit} onChangeMm={(fmin) => fmin >= 0 && edit({ fmin })} /></label>
      </div>

      <div className="row wrap">
        <label className="inl" title="Narrowest W (or smallest 2W + gap) within the tolerance">
          <input type="checkbox" checked={calc.compact} onChange={(e) => edit({ compact: e.target.checked })} /> Most compact within ±
        </label>
        <NumInput aria-label="Tolerance (%)" className="tol" value={calc.tol} onChange={(tol) => tol > 0 && tol < 50 && edit({ tol })} />
        <span className="unit">%</span>
      </div>

      <div className="row wrap">
        <label>f (GHz)<NumInput aria-label="Frequency for loss (GHz)" value={calc.freqGHz} onChange={(freqGHz) => freqGHz > 0 && set({ freqGHz })} /></label>
        <label title="Length for delay">L1 ({u})<OptLen label="Length L1" valueMm={calc.L1} unit={unit} onChangeMm={(L1) => set({ L1 })} /></label>
        <label title="Second length for skew">L2 ({u})<OptLen label="Length L2" valueMm={calc.L2} unit={unit} onChangeMm={(L2) => set({ L2 })} /></label>
      </div>

      <div className="row wrap">
        {!calc.compact && <button type="button" className="primary" disabled={searching} onClick={() => synth('findW')}>Find W</button>}
        {diff && !calc.compact && <button type="button" disabled={searching} onClick={() => synth('findS')}>Find gap</button>}
        {!calc.compact && (
          <button type="button" title={`Round W and S to ${toDisplay(ROUND_STEP[unit], unit).toFixed(unit === 'mil' ? 1 : unit === 'um' ? 0 : 3)} ${u}`} onClick={round}>Round</button>
        )}
        <span className="busy" aria-live="polite">{busy ?? ''}</span>
      </div>

      {msg && (
        <div className={`msg ${msg.cls}`} role="status">
          <span>{msg.text}</span>
          {msg.detail && (
            <details className="more">
              <summary>Why?</summary>
              <p className="hint">{msg.detail}</p>
            </details>
          )}
        </div>
      )}

      <Results
        result={shown?.result ?? null}
        line={shown?.line ?? lineOf(req)}
        calc={calc}
        unit={unit}
        names={{ layer: layer?.name ?? '', above: cu(calc.refAbove)?.name ?? null, below: cu(calc.refBelow)?.name ?? null }}
      />
    </div>
  );
}
