import type { AnalyzeResult } from '../solver/engine';
import { delayPs, skewPs } from '../solver/derived';
import type { CalcState } from '../state/types';
import type { Unit } from '../model/units';
import { CrossSectionDiagram, geometryLine } from './CrossSectionDiagram';
import { FieldPlot } from './FieldPlot';
import { topologyLabel } from './topology';
import { lenText } from './lenText';

/** Deviation chip class as in the original page: within tol ok, within 2·tol warn, beyond bad (dev is a fraction, tol in %). */
export function chipClass(dev: number, tolPct: number): 'ok' | 'warn' | 'bad' {
  const ad = Math.abs(dev), t = tolPct / 100;
  return ad <= t + 1e-12 ? 'ok' : ad <= 2 * t + 1e-12 ? 'warn' : 'bad';
}

const fmt = (v: number | undefined, n = 1): string => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(n));
const IN_PER_M = 0.0254;

interface Props {
  result: AnalyzeResult | null;
  /** The line the result was solved for (base widths). */
  line: { W: number; S?: number; G?: number | null };
  calc: CalcState;
  unit: Unit;
  names: { layer: string; above: string | null; below: string | null };
}

export function Results({ result, line, calc, unit, names }: Props) {
  if (result && !result.ok) return <div className="msg bad" role="alert">{result.error}</div>;
  const diff = result?.kind === 'diff';
  const z = !result ? NaN : result.kind === 'se' ? result.r.Z0 : result.r.Zdiff;
  const dev = (z - calc.target) / calc.target;
  const chip = Number.isFinite(dev) ? chipClass(dev, calc.tol) : 'idle';

  const items: [string, string][] = [];
  let tpd = NaN;
  let oddOnly = false;
  if (result?.kind === 'se') {
    const r = result.r;
    tpd = r.tpd;
    items.push(['εeff', fmt(r.eeff, 2)], ['tpd', `${fmt(r.tpd, 2)} ps/mm`],
      ['C', `${fmt((r.tpd / r.Z0) * 1000, 0)} pF/m`], ['L', `${fmt((r.tpd * r.Z0) / 1000, 3)} nH/mm`]);
  } else if (result?.kind === 'diff') {
    const r = result.r;
    tpd = r.tpdOdd;
    oddOnly = result.oddOnly;
    items.push(['Zodd', `${fmt(r.Zodd)} Ω`]);
    if (!oddOnly) items.push(['Zeven', `${fmt(r.Zeven)} Ω`], ['Zcm', `${fmt(r.Zcm)} Ω`]);
    items.push(['εeff odd', fmt(r.eodd, 2)], ['tpd', `${fmt(r.tpdOdd, 2)} ps/mm`]);
    if (!oddOnly) items.push(['Coupling', fmt(r.kb, 3)]);
  }
  if (result?.ok && result.lossDbPerM != null) {
    items.push([`Loss @ ${+calc.freqGHz.toFixed(3)} GHz`, `${fmt(result.lossDbPerM, 2)} dB/m · ${fmt(result.lossDbPerM * IN_PER_M, 3)} dB/in`]);
  }
  if (result?.ok && Number.isFinite(tpd) && calc.L1 != null) {
    items.push(['Delay', `${fmt(delayPs(tpd, calc.L1), 1)} ps`]);
    if (calc.L2 != null) items.push(['Skew', `${fmt(skewPs(tpd, calc.L1, calc.L2), 1)} ps`]);
  }

  const fab: { text: string; cls: 'bad' | 'warn' }[] = [];
  const lim = lenText(calc.fmin, unit);
  if (line.W < calc.fmin - 1e-9) fab.push({ text: `W < ${lim}`, cls: 'bad' });
  if (diff && line.S != null && line.S < calc.fmin - 1e-9) fab.push({ text: `gap < ${lim}`, cls: 'bad' });
  if (line.G != null && line.G < calc.fmin - 1e-9) fab.push({ text: `G < ${lim}`, cls: 'warn' });

  const xs = result?.ok ? result.xs : null;
  const geom = { W: line.W, S: diff ? line.S : undefined, G: line.G ?? null, Wtop: result?.ok ? result.wtop : undefined };
  const refNames = { above: names.above, below: names.below };

  return (
    <div className="results">
      <div className="result">
        <div className="big">
          <span className="lbl">{diff ? 'Zdiff' : 'Z0'}</span>
          <span className="val">{fmt(z)}<small>Ω</small></span>
          <span className={`chip devchip ${chip}`}>
            {Number.isFinite(dev) ? `${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(1)} % vs ${+calc.target.toFixed(2)} Ω` : '–'}
          </span>
        </div>
        <div className="kv">
          {items.map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}
        </div>
      </div>
      {(fab.length > 0 || oddOnly) && (
        <div className="row wrap chips">
          {fab.map((f) => <span key={f.text} className={`chip ${f.cls}`}>{f.text}</span>)}
          {oddOnly && <span className="chip warn">Odd mode only</span>}
        </div>
      )}
      {oddOnly && (
        <details className="more">
          <summary>Why?</summary>
          <p className="hint">No reference plane or coplanar GND: the even mode has no return path, so Zeven and Zcm are not defined. Zdiff = 2·Zodd still holds.</p>
        </details>
      )}
      {xs && (
        <>
          <div className="topo">{topologyLabel(xs.topology, diff, line.G != null)}</div>
          <p className="geo">
            {geometryLine(xs, refNames, unit)}
            {geom.Wtop != null ? ` · W_top ${lenText(geom.Wtop, unit)}` : ''}
          </p>
          {xs.warnings.map((w) => <p key={w} className="warnline">⚠ {w}</p>)}
          {xs.notes.length > 0 && (
            <details className="more">
              <summary>Assumptions ({xs.notes.length})</summary>
              <ul className="hint">{xs.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </details>
          )}
          {result?.ok && (
            <FieldPlot
              result={result}
              line={geom}
              names={{ base: xs.flipped ? names.above : names.below, cover: xs.flipped ? names.below : names.above }}
            />
          )}
          <CrossSectionDiagram xs={xs} line={geom} names={refNames} unit={unit} />
        </>
      )}
    </div>
  );
}
