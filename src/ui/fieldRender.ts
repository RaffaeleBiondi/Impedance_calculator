import type { AnalyzeResult } from '../solver/engine';
import { buildProblem, type LineGeom } from '../solver/problem';
import type { FieldData, Problem } from '../solver/types';

/** What renderField needs besides the result: canvas size in device pixels, the solved line, plane names, colours. */
export interface FieldView {
  width: number; height: number; dpr: number;
  line: LineGeom; // W, S, G as solved (base widths); Wtop when etched
  names: { base: string | null; cover: string | null }; // reference plane names (null: open side)
  colors: { copper: string; font: string };
}

/** Cell index i (0 … n−2) and fraction f in [0, 1] of v on a sorted axis; clamps outside. */
function locate(a: Float64Array, v: number): { i: number; f: number } {
  const n = a.length;
  if (n < 2) return { i: 0, f: 0 };
  if (v <= a[0]) return { i: 0, f: 0 };
  if (v >= a[n - 1]) return { i: n - 2, f: 1 };
  let lo = 0, hi = n - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= v) lo = m; else hi = m - 1; }
  return { i: lo, f: (v - a[lo]) / (a[lo + 1] - a[lo]) };
}

function bilinear(f: FieldData, cx: { i: number; f: number }, cy: { i: number; f: number }): number {
  const nx = f.xs.length;
  if (nx < 2 || f.ys.length < 2) return f.V[0] ?? 0;
  const p = cy.i * nx + cx.i, a = cx.f, b = cy.f, V = f.V;
  return (1 - a) * (1 - b) * V[p] + a * (1 - b) * V[p + 1] + (1 - a) * b * V[p + nx] + a * b * V[p + nx + 1];
}

/** Potential at (x, y) in the full cross-section: bilinear on the half-domain grid, mirrored for x < 0 (negated in odd mode). */
export function sampleField(f: FieldData, x: number, y: number, odd: boolean): number {
  const v = bilinear(f, locate(f.xs, Math.abs(x)), locate(f.ys, y));
  return odd && x < 0 ? -v : v;
}

// Fixed perceptual ramps (image content, readable on both themes), from the original page.
const SEQ = [[13, 38, 56], [24, 92, 112], [70, 150, 140], [196, 196, 140], [222, 140, 72], [245, 220, 170]];
const DIV = [[30, 70, 140], [90, 140, 200], [235, 235, 228], [226, 150, 90], [170, 80, 30]];
function ramp(stops: number[][], t: number, out: number[]): void {
  t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
  for (let c = 0; c < 3; c++) out[c] = stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f;
}

/** Visible window of the cross-section in solver coordinates, and whether to flip it so the stackup top is up. */
export interface FieldWindow { problem: Problem; xr: number; ylo: number; yhi: number; flip: boolean }

type OkResult = Extract<AnalyzeResult, { ok: true }>;

export function fieldWindow(result: OkResult, line: LineGeom): FieldWindow {
  const xs = result.xs;
  const diff = result.kind === 'diff';
  const geom: LineGeom = { W: line.W, S: diff ? line.S : undefined, G: line.G ?? null, Wtop: line.Wtop ?? result.wtop };
  const p = buildProblem(xs, geom, diff ? 'odd' : 'se', 1);
  const full = p.diel.filter((d) => d.x0 < 0 && d.x1 > p.xmax);
  const trace = p.cond.filter((c) => c.v === 1);
  const yb = Math.min(...trace.map((c) => c.y0));
  const yt = Math.max(...trace.map((c) => c.y1));
  const matLo = Math.min(yb, ...full.map((d) => d.y0));
  const matHi = Math.max(yt, ...full.map((d) => d.y1));
  // Open sides: show air up to 2.2 × the distance to the reference (the original page's microstrip view).
  const href = xs.baseRef ? yb : xs.coverRef ? p.ymax - yt : Math.max(xs.T, Math.min(yb - matLo, matHi - yt));
  const m = 2.2 * href;
  const ylo = xs.baseRef ? 0 : Math.max(0, matLo - m);
  const yhi = xs.coverRef ? p.ymax : Math.min(p.ymax, matHi + m);
  const xb = diff ? (geom.S as number) / 2 + geom.W : geom.W / 2;
  const xr = Math.min(p.xmax, xb + (geom.G ?? 0) + 2 * (yhi - ylo));
  return { problem: p, xr, ylo, yhi, flip: xs.flipped };
}

/** Height / width of the visible window (for sizing the canvas). */
export function fieldAspect(result: AnalyzeResult, line: LineGeom): number {
  if (!result.ok) return 0.4;
  const w = fieldWindow(result, line);
  return (w.yhi - w.ylo) / (2 * w.xr);
}

/**
 * Draw the potential of a solved cross-section, ported from the original page's drawField and generalised:
 * N slabs (dashed interfaces), planes labelled with layer names, trapezoid slices, coplanar GND, open sides,
 * contour every 0.1, sequential ramp (SE / even) or diverging ramp (odd, −1 … +1 V).
 */
export function renderField(ctx: CanvasRenderingContext2D, result: AnalyzeResult, view: FieldView): void {
  if (!result.ok) return;
  const field = result.r.field;
  const odd = result.kind === 'diff';
  const { problem: p, xr, ylo, yhi, flip } = fieldWindow(result, view.line);
  const Wpx = Math.max(1, Math.round(view.width)), Hpx = Math.max(1, Math.round(view.height));
  const sx = (2 * xr) / Wpx, sy = (yhi - ylo) / Hpx;
  const X = (x: number) => (x + xr) / sx;
  const Y = (y: number) => (flip ? y - ylo : yhi - y) / sy;

  // ---- potential image with contours
  const cols = new Array(Wpx);
  for (let px = 0; px < Wpx; px++) {
    const xx = -xr + (px + 0.5) * sx;
    cols[px] = { ...locate(field.xs, Math.abs(xx)), neg: odd && xx < 0 };
  }
  const val = new Float32Array(Wpx * Hpx);
  for (let py = 0; py < Hpx; py++) {
    const y = flip ? ylo + (py + 0.5) * sy : yhi - (py + 0.5) * sy;
    const cy = locate(field.ys, y);
    for (let px = 0; px < Wpx; px++) {
      const c = cols[px];
      const v = bilinear(field, c, cy);
      val[py * Wpx + px] = c.neg ? -v : v;
    }
  }
  const img = ctx.createImageData(Wpx, Hpx);
  const rgb = [0, 0, 0];
  for (let k = 0; k < Wpx * Hpx; k++) {
    const v = val[k];
    ramp(odd ? DIV : SEQ, odd ? (v + 1) / 2 : v, rgb);
    const px = k % Wpx;
    let line = false;
    if (px > 0 && k >= Wpx) {
      const b0 = Math.floor(v * 10 + 1e-6);
      line = b0 !== Math.floor(val[k - 1] * 10 + 1e-6) || b0 !== Math.floor(val[k - Wpx] * 10 + 1e-6);
    }
    const o = k * 4, s = line ? 0.62 : 1;
    img.data[o] = rgb[0] * s; img.data[o + 1] = rgb[1] * s; img.data[o + 2] = rgb[2] * s; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const dpr = view.dpr || 1;
  // ---- dielectric interfaces (full-width bands)
  const ys = new Set<number>();
  for (const d of p.diel) if (d.x0 < 0 && d.x1 > p.xmax) { ys.add(d.y0); ys.add(d.y1); }
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = dpr;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  for (const y of ys) {
    if (y <= ylo + 1e-9 || y >= yhi - 1e-9) continue;
    const py = Y(y);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(Wpx, py); ctx.stroke();
  }
  ctx.restore();

  // ---- conductors: trace slices and coplanar GND slices, mirrored about x = 0
  ctx.fillStyle = view.colors.copper;
  const rect = (x0: number, x1: number, y0: number, y1: number) => {
    const a0 = X(Math.max(-xr, x0)), a1 = X(Math.min(xr, x1));
    if (!(a1 > a0)) return;
    const top = Math.min(Y(y0), Y(y1)), h = Math.abs(Y(y1) - Y(y0));
    ctx.fillRect(a0, top, a1 - a0, Math.max(1, h));
  };
  for (const c of p.cond) {
    rect(c.x0, c.x1, c.y0, c.y1);
    rect(-c.x1, -c.x0, c.y0, c.y1);
  }

  // ---- planes (drawn inside the window edge) and labels
  const bar = Math.max(3 * dpr, Math.round(0.035 / sy));
  const fontPx = 11 * dpr;
  ctx.font = `${fontPx}px ${view.colors.font || 'monospace'}`;
  ctx.textBaseline = 'middle';
  const label = (text: string, atTop: boolean) => {
    const w = ctx.measureText(text).width, pad = 4 * dpr, h = fontPx + 2 * pad;
    const x = 8 * dpr, y = atTop ? bar + 4 * dpr : Hpx - bar - 4 * dpr - h;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w + 2 * pad, h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(text, x + pad, y + h / 2);
  };
  // Base plane sits at y = 0, the cover plane at ymax; the screen side depends on the flip.
  const planes: { name: string | null; atTop: boolean }[] = [];
  if (result.xs.baseRef && ylo <= 1e-12) planes.push({ name: view.names.base, atTop: flip });
  if (result.xs.coverRef && yhi >= p.ymax - 1e-12) planes.push({ name: view.names.cover, atTop: !flip });
  for (const pl of planes) {
    ctx.fillStyle = view.colors.copper;
    ctx.fillRect(0, pl.atTop ? 0 : Hpx - bar, Wpx, bar);
  }
  for (const pl of planes) label(pl.name ?? 'plane', pl.atTop);
}
