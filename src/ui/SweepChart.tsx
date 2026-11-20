import { useMemo, useState } from 'react';
import { toDisplay, type Unit } from '../model/units';
import { useThemeVersion } from './theme';

export interface SweepPoint { x: number; z: number | null }
interface Props {
  points: SweepPoint[];
  target: number;
  tolPct: number;
  fmin: number;
  unit: Unit;
  xName: string;
}

const W = 640, H = 280, M = { l: 52, r: 14, t: 12, b: 38 };

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const fmt = (v: number) => String(parseFloat(v.toPrecision(4)));

/** Hand-rolled SVG: Z line, target, ±tol band, fab-minimum line, hover readout. Colours come from CSS variables. */
export function SweepChart({ points, target, tolPct, fmin, unit, xName }: Props) {
  useThemeVersion();
  const [hover, setHover] = useState<number | null>(null);
  const ok = useMemo(() => points.filter((p): p is { x: number; z: number } => p.z !== null && Number.isFinite(p.z)), [points]);

  const geo = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const lo = target * (1 - tolPct / 100), hi = target * (1 + tolPct / 100);
    const zs = [...ok.map((p) => p.z), lo, hi];
    let y0 = Math.min(...zs), y1 = Math.max(...zs);
    const pad = (y1 - y0) * 0.08 || 1;
    y0 -= pad; y1 += pad;
    const sx = (x: number) => M.l + ((x - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
    const sy = (y: number) => H - M.b - ((y - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
    return { x0, x1, y0, y1, lo, hi, sx, sy };
  }, [points, ok, target, tolPct]);

  if (!geo) return null;
  const { x0, x1, y0, y1, lo, hi, sx, sy } = geo;
  const xt = niceTicks(toDisplay(x0, unit), toDisplay(x1, unit), 6);
  const yt = niceTicks(y0, y1, 5);
  const path = ok.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.z).toFixed(1)}`).join('');
  const fabX = fmin >= x0 && fmin <= x1 ? sx(fmin) : null;
  const hp = hover !== null ? ok[hover] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / (r.width || 1)) * W;
    let best = -1, bd = Infinity;
    ok.forEach((p, i) => { const d = Math.abs(sx(p.x) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best >= 0 ? best : null);
  };

  return (
    <svg className="sweepchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Z sweep chart"
      onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <rect x={M.l} y={sy(hi)} width={W - M.l - M.r} height={Math.max(0, sy(lo) - sy(hi))} className="sc-band" />
      {yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className="sc-grid" />
          <text x={M.l - 6} y={sy(v) + 4} textAnchor="end" className="sc-tick">{fmt(v)}</text>
        </g>
      ))}
      {xt.map((v) => {
        const mm = v / toDisplay(1, unit);
        return (
          <g key={`x${v}`}>
            <line x1={sx(mm)} x2={sx(mm)} y1={H - M.b} y2={H - M.b + 4} className="sc-axis" />
            <text x={sx(mm)} y={H - M.b + 16} textAnchor="middle" className="sc-tick">{fmt(v)}</text>
          </g>
        );
      })}
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="sc-axis" />
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="sc-axis" />
      <line x1={M.l} x2={W - M.r} y1={sy(target)} y2={sy(target)} className="sc-target" />
      {fabX !== null && (
        <g>
          <line x1={fabX} x2={fabX} y1={M.t} y2={H - M.b} className="sc-fab" />
          <text x={fabX + 4} y={M.t + 10} className="sc-tick">fab min</text>
        </g>
      )}
      <path d={path} className="sc-line" fill="none" />
      {ok.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.z)} r={i === hover ? 4.5 : 2.5} className="sc-dot" />)}
      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" className="sc-label">{xName} ({unit})</text>
      <text x={12} y={(M.t + H - M.b) / 2} transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`} textAnchor="middle" className="sc-label">Z (Ω)</text>
      {hp && (
        <g pointerEvents="none">
          <line x1={sx(hp.x)} x2={sx(hp.x)} y1={M.t} y2={H - M.b} className="sc-cross" />
          <text x={Math.min(Math.max(sx(hp.x), M.l + 70), W - M.r - 70)} y={M.t + 12} textAnchor="middle" className="sc-read">
            {xName} {fmt(toDisplay(hp.x, unit))} {unit} · {hp.z.toFixed(2)} Ω
          </text>
        </g>
      )}
    </svg>
  );
}
