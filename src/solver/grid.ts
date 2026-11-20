import type { Grid, Problem } from './types';

function uniqSorted(a: number[]): number[] {
  a = a.slice().sort((p, q) => p - q);
  const out: number[] = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 1e-9) out.push(v);
  return out;
}

/** 1-D graded axis: every key coordinate is a grid line; spacing grows away from "fine" points. */
export function buildAxis(
  keys: number[], fines: number[], hmin: number, hmax: number, growth: number, minCells: number,
): Float64Array {
  keys = uniqSorted(keys);
  const hfun = (x: number): number => {
    let d = Infinity;
    for (const f of fines) { const e = Math.abs(x - f); if (e < d) d = e; }
    return Math.min(hmax, hmin + (growth - 1) * d);
  };
  const nodes = [keys[0]];
  for (let k = 0; k + 1 < keys.length; k++) {
    const a = keys[k], b = keys[k + 1], L = b - a, M = 200;
    const s = new Float64Array(M + 1);
    for (let m = 0; m < M; m++) s[m + 1] = s[m] + (L / M) / hfun(a + (m + 0.5) * L / M);
    const N = Math.max(minCells, Math.ceil(s[M] - 1e-9));
    let m = 0;
    for (let n = 1; n < N; n++) {
      const tgt = n * s[M] / N;
      while (s[m + 1] < tgt) m++;
      const f = (tgt - s[m]) / (s[m + 1] - s[m]);
      nodes.push(a + (m + f) * L / M);
    }
    nodes.push(b);
  }
  return Float64Array.from(nodes);
}

/** Mesh node cap: a grid above this is refused rather than solved (keeps the browser responsive). */
export const MAX_NODES = 400_000;

/** Geometry the solver refuses (for example a grid above MAX_NODES). */
export class GeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeometryError';
  }
}

export function makeGrid(p: Problem): Grid {
  const xs = buildAxis([0, p.xmax, ...p.keysX], p.fineX, p.hminX || p.hmin, p.hmaxX || p.hmax, p.growth, 1);
  if (xs.length * 3 > MAX_NODES) throw tooLarge(xs.length * 3);
  const ys = buildAxis([0, p.ymax, ...p.keysY], p.fineY, p.hmin, p.hmaxY || p.hmax, p.growth, 2);
  const n = xs.length * ys.length;
  if (n > MAX_NODES) throw tooLarge(n);
  return { xs, ys };
}

function tooLarge(n: number): GeometryError {
  return new GeometryError(
    `Geometry too large for the solver: ${n} mesh nodes exceed the ${MAX_NODES} cap (extreme width/thickness ratio?)`,
  );
}
