import { useMemo } from 'react';
import type { CrossSection } from '../model/crossSection';
import type { LineGeom } from '../solver/problem';
import type { Unit } from '../model/units';
import { useThemeVersion } from './theme';
import { topologyLabel } from './topology';
import { erText, lenText } from './lenText';

/** One horizontal band of the schematic cross-section, top to bottom in stackup order. */
export type Row =
  | { kind: 'plane'; name: string }
  | { kind: 'air'; open: boolean } // open: an inner/base side with no reference
  | { kind: 'mask'; t: number; er: number } // flat mask on an open board surface
  | { kind: 'slab'; label: string; t: number; er: number; cut: boolean }
  | { kind: 'trace'; T: number };

export interface RefNames { above: string | null; below: string | null }

/** Bands of the cross-section in physical (stackup) order, top first. */
export function stackRows(xs: CrossSection, names: RefNames): Row[] {
  const baseName = xs.flipped ? names.above : names.below;
  const coverName = xs.flipped ? names.below : names.above;
  const slab = (s: CrossSection['base'][number]): Row =>
    ({ kind: 'slab', label: s.label, t: s.t, er: s.er, cut: /\(cut out\)$/.test(s.label) });
  const up: Row[] = []; // away from the base
  if (xs.baseRef) up.push({ kind: 'plane', name: baseName ?? 'plane' });
  else {
    up.push({ kind: 'air', open: true });
    if (xs.baseOpenMask) up.push({ kind: 'mask', t: xs.baseOpenMask.t, er: xs.baseOpenMask.er });
  }
  for (let k = xs.base.length - 1; k >= 0; k--) up.push(slab(xs.base[k]));
  up.push({ kind: 'trace', T: xs.T });
  if (xs.outer) up.push({ kind: 'air', open: false });
  else {
    for (const c of xs.cover) up.push(slab(c));
    if (xs.coverRef) up.push({ kind: 'plane', name: coverName ?? 'plane' });
    else {
      if (xs.coverOpenMask) up.push({ kind: 'mask', t: xs.coverOpenMask.t, er: xs.coverOpenMask.er });
      up.push({ kind: 'air', open: true });
    }
  }
  // Base below (not flipped): "away from the base" is up, so reverse for top-down order.
  return xs.flipped ? up : up.reverse();
}

/** One-line description of the bands, top to bottom. */
export function geometryLine(xs: CrossSection, names: RefNames, unit: Unit): string {
  return stackRows(xs, names).map((r) => {
    switch (r.kind) {
      case 'plane': return r.name;
      case 'air': return r.open ? 'open' : 'air';
      case 'mask': return `mask ${lenText(r.t, unit)} εr ${erText(r.er)}`;
      case 'slab': return `${r.label} ${lenText(r.t, unit)} εr ${erText(r.er)}`;
      case 'trace': {
        const m = xs.outer && xs.coverMask ? ` + mask ${lenText(xs.coverMask.t, unit)} εr ${erText(xs.coverMask.er)}` : '';
        return `T ${lenText(r.T, unit)}${m}`;
      }
    }
  }).join(' | ');
}

const VW = 640;
const CX = 436; // centre of the line drawing; labels sit on the left
const HALF = 196; // half-width available for the drawing
const LX = 8;

function rowHeight(r: Row): number {
  switch (r.kind) {
    case 'plane': return 16;
    case 'air': return r.open ? 30 : 38;
    case 'mask': return 16;
    case 'trace': return 22;
    case 'slab': return Math.min(60, Math.max(32, r.t * 160));
  }
}

const S = (v: string) => ({ fill: `var(${v})` });

interface Props { xs: CrossSection; line: LineGeom; names: RefNames; unit: Unit }

/** Schematic cross-section of the line being calculated (inline SVG, CSS-token colours). */
export function CrossSectionDiagram({ xs, line, names, unit }: Props) {
  const theme = useThemeVersion();
  const diff = line.S != null && line.S > 0;
  const cpw = line.G != null && line.G > 0;
  const title = topologyLabel(xs.topology, diff, cpw);

  const svg = useMemo(() => {
    const rows = stackRows(xs, names);
    const tops: number[] = [];
    let y = 4;
    for (const r of rows) { tops.push(y); y += rowHeight(r); }
    const VH = y + 4;
    const ti = rows.findIndex((r) => r.kind === 'trace');
    const tTop = tops[ti], tBot = tTop + rowHeight(rows[ti]);
    const baseAtBottom = !xs.flipped;
    const yBase = baseAtBottom ? tBot : tTop, yNarrow = baseAtBottom ? tTop : tBot;

    // horizontal scale (mm → px)
    const W = line.W, Sg = diff ? (line.S as number) : 0, G = cpw ? (line.G as number) : 0;
    const xb = diff ? Sg / 2 + W : W / 2;
    const sx = Math.min((2 * HALF - 40) / (2 * (xb + G)), 160 / (2 * xb));
    const X = (x: number) => CX + x * sx;
    const inset = line.Wtop != null && line.Wtop < W ? ((W - line.Wtop) / 2) : 0;
    const poly = (x0: number, x1: number, d0: number, d1: number) =>
      `${X(x0)},${yBase} ${X(x1)},${yBase} ${X(x1) - d1 * sx},${yNarrow} ${X(x0) + d0 * sx},${yNarrow}`;
    const traces = diff ? [[-xb, -Sg / 2], [Sg / 2, xb]] : [[-xb, xb]];
    const shapes: string[] = traces.map(([a, b]) => poly(a, b, inset, inset));
    const left = CX - HALF + 4, right = VW - 4;
    if (cpw) {
      // GND edges follow the trace profile: the inner edge moves outward toward the narrow side.
      shapes.push(`${left},${yBase} ${X(-xb - G)},${yBase} ${X(-xb - G) - inset * sx},${yNarrow} ${left},${yNarrow}`);
      shapes.push(`${X(xb + G)},${yBase} ${right},${yBase} ${right},${yNarrow} ${X(xb + G) + inset * sx},${yNarrow}`);
    }
    const mask = xs.outer && xs.coverMask ? xs.coverMask : null;

    // dimension lines, on the base side (W, S and G are base widths)
    const dimY = baseAtBottom ? yBase + 9 : yBase - 9;
    const txtY = baseAtBottom ? yBase + 22 : yBase - 15;
    const dims: { x0: number; x1: number; text: string }[] = [];
    dims.push({ x0: X(diff ? Sg / 2 : -xb), x1: X(xb), text: `W ${lenText(W, unit)}` });
    if (diff) dims.push({ x0: X(-Sg / 2), x1: X(Sg / 2), text: `S ${lenText(Sg, unit)}` });
    if (cpw) dims.push({ x0: X(xb), x1: X(xb + G), text: `G ${lenText(G, unit)}` });

    let tone = 0;
    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" aria-label={`${title} cross-section`} className="xs-svg">
        {rows.map((r, k) => {
          const y0 = tops[k], h = rowHeight(r), mid = y0 + h / 2;
          switch (r.kind) {
            case 'plane':
              return (
                <g key={k}>
                  <rect x={0} y={y0} width={VW} height={h} style={S('--accent')} />
                  <text x={LX} y={mid} dominantBaseline="central" className="xs-plane">{r.name}</text>
                </g>
              );
            case 'air':
              return (
                <g key={k}>
                  <rect x={0} y={y0} width={VW} height={h} style={S('--xs-air')} />
                  <text x={LX} y={mask && !r.open ? y0 + 12 : mid} dominantBaseline="central" className="xs-lbl muted">{r.open ? 'open · air' : 'air'}</text>
                  {mask && !r.open && (
                    <text x={LX} y={y0 + 28} dominantBaseline="central" className="xs-lbl muted">{`mask ${lenText(mask.t, unit)} · εr ${erText(mask.er)}`}</text>
                  )}
                </g>
              );
            case 'mask':
              return (
                <g key={k}>
                  <rect x={0} y={y0} width={VW} height={h} style={S('--xs-mask')} />
                  <text x={LX} y={mid} dominantBaseline="central" className="xs-lbl">{`mask ${lenText(r.t, unit)} · εr ${erText(r.er)}`}</text>
                </g>
              );
            case 'slab': {
              const t = tone++ % 2 ? '--xs-diel-b' : '--xs-diel-a';
              return (
                <g key={k}>
                  <rect x={0} y={y0} width={VW} height={h} style={S(t)} />
                  {r.cut && <rect x={1} y={y0 + 1} width={VW - 2} height={h - 2} className="xs-cut" />}
                  <text x={LX} y={mid} dominantBaseline="central" className="xs-lbl">{`${r.label} · ${lenText(r.t, unit)} · εr ${erText(r.er)}`}</text>
                </g>
              );
            }
            case 'trace': {
              const fill = xs.outer ? '--xs-air' : '--xs-diel-a';
              return (
                <g key={k}>
                  <rect x={0} y={y0} width={VW} height={h} style={S(fill)} />
                  {mask && <rect x={0} y={baseAtBottom ? y0 + h - 4 : y0} width={VW} height={4} style={S('--xs-mask')} />}
                  <text x={LX} y={mid} dominantBaseline="central" className="xs-lbl muted">{`T ${lenText(r.T, unit)}`}</text>
                </g>
              );
            }
          }
        })}
        {mask && shapes.map((p, k) => <polygon key={`m${k}`} points={p} className="xs-maskline" />)}
        {shapes.map((p, k) => <polygon key={`c${k}`} points={p} style={S('--accent')} />)}
        {dims.map((d, k) => (
          <g key={`d${k}`} className="xs-dim">
            <line x1={d.x0} y1={dimY} x2={d.x1} y2={dimY} />
            <path d={`M${d.x0 + 4},${dimY - 3} L${d.x0},${dimY} L${d.x0 + 4},${dimY + 3} M${d.x1 - 4},${dimY - 3} L${d.x1},${dimY} L${d.x1 - 4},${dimY + 3}`} />
            <text x={(d.x0 + d.x1) / 2} y={txtY} textAnchor="middle" dominantBaseline="central">{d.text}</text>
          </g>
        ))}
      </svg>
    );
    // theme: CSS variables re-resolve on their own, but redraw on theme change as the owner asked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xs, line.W, line.S, line.G, line.Wtop, names.above, names.below, unit, diff, cpw, title, theme]);

  return (
    <figure className="xsdiag" aria-label="Cross-section">
      <div className="xs-title">{title}</div>
      {svg}
      <figcaption className="hint">not to scale</figcaption>
    </figure>
  );
}
