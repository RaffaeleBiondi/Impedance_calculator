import type { CapResult, Grid, Problem } from './types';

/** Finite-volume capacitance (relative to eps0, per unit length of the solved half domain): IC(0)-PCG + field energy. */
export function solveCap(p: Problem, grid: Grid, useDiel: boolean): CapResult {
  const { xs, ys } = grid, nx = xs.length, ny = ys.length, N = nx * ny;
  const tol = 1e-9;
  // cell permittivity (cell i,j spans xs[i..i+1] x ys[j..j+1])
  const er = new Float64Array((nx - 1) * (ny - 1)).fill(1);
  const td = new Float64Array((nx - 1) * (ny - 1)); // loss tangent of the same rectangle that sets er (air = 0)
  if (useDiel) for (let j = 0; j < ny - 1; j++) {
    const yc = 0.5 * (ys[j] + ys[j + 1]);
    for (let i = 0; i < nx - 1; i++) {
      const xc = 0.5 * (xs[i] + xs[i + 1]);
      let e = 1, t = 0;
      for (const d of p.diel) if (xc >= d.x0 && xc <= d.x1 && yc >= d.y0 && yc <= d.y1) { e = d.er; t = d.tand ?? 0; }
      er[j * (nx - 1) + i] = e;
      td[j * (nx - 1) + i] = t;
    }
  }
  const V = new Float64Array(N), fixed = new Uint8Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = j * nx + i, x = xs[i], y = ys[j];
    if (j === 0 || (j === ny - 1 && p.topBC !== 'neumann') || (i === 0 && p.leftBC === 'dirichlet')) { fixed[id] = 1; V[id] = 0; }
    for (const c of p.cond) if (x >= c.x0 - tol && x <= c.x1 + tol && y >= c.y0 - tol && y <= c.y1 + tol) { fixed[id] = 1; V[id] = c.v; }
  }
  // edge coefficients (east / north) — box integration
  const ce = new Float64Array(N), cn = new Float64Array(N);
  // same coefficients weighted by each adjacent cell's tan(delta): the lossy share of every edge term
  const cet = new Float64Array(N), cnt = new Float64Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = j * nx + i;
    if (i < nx - 1) {
      let a = 0, at = 0;
      if (j > 0) { const w = er[(j - 1) * (nx - 1) + i] * (ys[j] - ys[j - 1]) / 2; a += w; at += w * td[(j - 1) * (nx - 1) + i]; }
      if (j < ny - 1) { const w = er[j * (nx - 1) + i] * (ys[j + 1] - ys[j]) / 2; a += w; at += w * td[j * (nx - 1) + i]; }
      ce[id] = a / (xs[i + 1] - xs[i]);
      cet[id] = at / (xs[i + 1] - xs[i]);
    }
    if (j < ny - 1) {
      let a = 0, at = 0;
      if (i > 0) { const w = er[j * (nx - 1) + i - 1] * (xs[i] - xs[i - 1]) / 2; a += w; at += w * td[j * (nx - 1) + i - 1]; }
      if (i < nx - 1) { const w = er[j * (nx - 1) + i] * (xs[i + 1] - xs[i]) / 2; a += w; at += w * td[j * (nx - 1) + i]; }
      cn[id] = a / (ys[j + 1] - ys[j]);
      cnt[id] = at / (ys[j + 1] - ys[j]);
    }
  }
  // A v = b on free nodes, PCG with Jacobi preconditioner
  const diag = new Float64Array(N), b = new Float64Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = j * nx + i;
    if (fixed[id]) continue;
    let d = 0, s = 0;
    if (i < nx - 1) { d += ce[id]; if (fixed[id + 1]) s += ce[id] * V[id + 1]; }
    if (i > 0) { d += ce[id - 1]; if (fixed[id - 1]) s += ce[id - 1] * V[id - 1]; }
    if (j < ny - 1) { d += cn[id]; if (fixed[id + nx]) s += cn[id] * V[id + nx]; }
    if (j > 0) { d += cn[id - nx]; if (fixed[id - nx]) s += cn[id - nx] * V[id - nx]; }
    diag[id] = d; b[id] = s;
  }
  const Ap = (x: Float64Array, out: Float64Array): void => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      if (fixed[id]) { out[id] = 0; continue; }
      const xi = x[id];
      let s = diag[id] * xi;
      if (i < nx - 1 && !fixed[id + 1]) s -= ce[id] * x[id + 1];
      if (i > 0 && !fixed[id - 1]) s -= ce[id - 1] * x[id - 1];
      if (j < ny - 1 && !fixed[id + nx]) s -= cn[id] * x[id + nx];
      if (j > 0 && !fixed[id - nx]) s -= cn[id - nx] * x[id - nx];
      out[id] = s;
    }
  };
  // IC(0) preconditioner on the 5-point stencil (natural ordering), couplings to fixed nodes dropped
  const dt = new Float64Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = j * nx + i;
    if (fixed[id]) continue;
    let d = diag[id];
    if (i > 0 && !fixed[id - 1]) d -= ce[id - 1] * ce[id - 1] / dt[id - 1];
    if (j > 0 && !fixed[id - nx]) d -= cn[id - nx] * cn[id - nx] / dt[id - nx];
    dt[id] = d;
  }
  const prec = (r: Float64Array, z: Float64Array): void => {
    for (let id = 0; id < N; id++) {
      if (fixed[id]) { z[id] = 0; continue; }
      const i = id % nx;
      let s = r[id];
      if (i > 0 && !fixed[id - 1]) s += ce[id - 1] * z[id - 1];
      if (id >= nx && !fixed[id - nx]) s += cn[id - nx] * z[id - nx];
      z[id] = s / dt[id];
    }
    for (let id = N - 1; id >= 0; id--) {
      if (fixed[id]) continue;
      const i = id % nx;
      let s = 0;
      if (i < nx - 1 && !fixed[id + 1]) s += ce[id] * z[id + 1];
      if (id + nx < N && !fixed[id + nx]) s += cn[id] * z[id + nx];
      z[id] += s / dt[id];
    }
  };
  const x = new Float64Array(N), r = Float64Array.from(b), z = new Float64Array(N), q = new Float64Array(N);
  prec(r, z);
  const pv = Float64Array.from(z);
  let rz = 0, bb = 0;
  for (let k = 0; k < N; k++) { rz += r[k] * z[k]; bb += b[k] * b[k]; }
  let it = 0;
  const maxIt = 20000, eps2 = 1e-20 * bb;
  for (; it < maxIt; it++) {
    Ap(pv, q);
    let pq = 0; for (let k = 0; k < N; k++) pq += pv[k] * q[k];
    const al = rz / pq;
    let rr = 0;
    for (let k = 0; k < N; k++) { x[k] += al * pv[k]; r[k] -= al * q[k]; rr += r[k] * r[k]; }
    if (rr < eps2) break;
    prec(r, z);
    let rz2 = 0;
    for (let k = 0; k < N; k++) rz2 += r[k] * z[k];
    const be = rz2 / rz; rz = rz2;
    for (let k = 0; k < N; k++) pv[k] = z[k] + be * pv[k];
  }
  for (let k = 0; k < N; k++) if (!fixed[k]) V[k] = x[k];
  // energy -> capacitance (relative to eps0), per unit length of the solved half domain
  let W = 0, Wt = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = j * nx + i;
    if (i < nx - 1) { const dv = V[id] - V[id + 1]; W += ce[id] * dv * dv; Wt += cet[id] * dv * dv; }
    if (j < ny - 1) { const dv = V[id] - V[id + nx]; W += cn[id] * dv * dv; Wt += cnt[id] * dv * dv; }
  }
  return useDiel ? { c: W, V, iters: it, nx, ny, tandEff: W > 0 ? Wt / W : 0 } : { c: W, V, iters: it, nx, ny };
}
