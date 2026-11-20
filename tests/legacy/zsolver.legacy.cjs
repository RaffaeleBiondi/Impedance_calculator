// 2D quasi-static field solver for PCB transmission lines (finite volumes on a graded rectilinear grid).
// Same source runs in node (tables) and in the browser (calculator). Units: mm.
// Z0 = 1 / (c * sqrt(C * C_air)), C from the field energy; odd/even modes from symmetry walls at x = 0.
(function (root) {
  const C0 = 299792458;          // m/s
  const EPS0 = 8.8541878128e-12; // F/m

  function uniqSorted(a) {
    a = a.slice().sort((p, q) => p - q);
    const out = [];
    for (const v of a) if (!out.length || v - out[out.length - 1] > 1e-9) out.push(v);
    return out;
  }

  // 1-D graded axis: every key coordinate is a grid line; spacing grows away from "fine" points.
  function buildAxis(keys, fines, hmin, hmax, growth, minCells) {
    keys = uniqSorted(keys);
    const hfun = (x) => {
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

  // prob: {xmax, ymax, leftBC:'neumann'|'dirichlet', topBC:'ground'|'neumann', diel:[{x0,x1,y0,y1,er}],
  //        cond:[{x0,x1,y0,y1,v}], keysX, keysY, fineX, fineY, hmin, hmax, growth}
  function makeGrid(p) {
    const xs = buildAxis([0, p.xmax, ...p.keysX], p.fineX, p.hminX || p.hmin, p.hmaxX || p.hmax, p.growth, 1);
    const ys = buildAxis([0, p.ymax, ...p.keysY], p.fineY, p.hminY || p.hmin, p.hmaxY || p.hmax, p.growth, 2);
    return { xs, ys };
  }

  function solveCap(p, grid, useDiel) {
    const { xs, ys } = grid, nx = xs.length, ny = ys.length, N = nx * ny;
    const tol = 1e-9;
    // cell permittivity (cell i,j spans xs[i..i+1] x ys[j..j+1])
    const er = new Float64Array((nx - 1) * (ny - 1)).fill(1);
    if (useDiel) for (let j = 0; j < ny - 1; j++) {
      const yc = 0.5 * (ys[j] + ys[j + 1]);
      for (let i = 0; i < nx - 1; i++) {
        const xc = 0.5 * (xs[i] + xs[i + 1]);
        let e = 1;
        for (const d of p.diel) if (xc >= d.x0 && xc <= d.x1 && yc >= d.y0 && yc <= d.y1) e = d.er;
        er[j * (nx - 1) + i] = e;
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
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      if (i < nx - 1) {
        let a = 0;
        if (j > 0) a += er[(j - 1) * (nx - 1) + i] * (ys[j] - ys[j - 1]) / 2;
        if (j < ny - 1) a += er[j * (nx - 1) + i] * (ys[j + 1] - ys[j]) / 2;
        ce[id] = a / (xs[i + 1] - xs[i]);
      }
      if (j < ny - 1) {
        let a = 0;
        if (i > 0) a += er[j * (nx - 1) + i - 1] * (xs[i] - xs[i - 1]) / 2;
        if (i < nx - 1) a += er[j * (nx - 1) + i] * (xs[i + 1] - xs[i]) / 2;
        cn[id] = a / (ys[j + 1] - ys[j]);
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
    const Ap = (x, out) => {
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
    const prec = (r, z) => {
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
    let W = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      if (i < nx - 1) { const dv = V[id] - V[id + 1]; W += ce[id] * dv * dv; }
      if (j < ny - 1) { const dv = V[id] - V[id + nx]; W += cn[id] * dv * dv; }
    }
    return { c: W, V, iters: it, nx, ny };
  }

  // ---------------------------------------------------------------- geometry builders
  // g: {type:'micro'|'strip', W, S (diff gap, 0/null = single ended), T, G (coplanar GND gap, null = none),
  //     micro: H, er, tm (mask thickness), erm (mask er)
  //     strip: H1, er1 (below, trace sits on it), H2, er2 (above), erf (fills the trace layer)}
  // mode: 'se' | 'odd' | 'even'; q: mesh quality (1 = default)
  function buildProblem(g, mode, q) {
    q = q || 1;
    const T = Math.max(0, g.T), W = g.W;
    const diff = mode !== 'se';
    const xa = diff ? g.S / 2 : 0, xb = diff ? g.S / 2 + W : W / 2; // trace span in the half domain
    const hasG = g.G != null && g.G > 0;
    const xg = hasG ? xb + g.G : null;
    const diel = [], cond = [];
    let yb, ymax, xmax, keysY, fineY, Href;
    if (g.type === 'micro') {
      Href = g.H; yb = g.H;
      const dm = g.dom || 1;
      xmax = xb + dm * Math.max(30 * g.H, 6 * W) + (hasG ? g.G : 0);
      ymax = g.H + T + dm * Math.max(30 * g.H, 6 * W);
      diel.push({ x0: -1, x1: xmax + 1, y0: 0, y1: g.H, er: g.er });
      const tm = g.tm || 0;
      if (tm > 0) {
        diel.push({ x0: -1, x1: xmax + 1, y0: g.H, y1: g.H + tm, er: g.erm });
        diel.push({ x0: diff ? xa - tm : -1, x1: xb + tm, y0: g.H, y1: g.H + T + tm, er: g.erm });
        if (hasG) diel.push({ x0: xg - tm, x1: xmax + 1, y0: g.H, y1: g.H + T + tm, er: g.erm });
      }
      keysY = [g.H, g.H + T].concat(tm > 0 ? [g.H + tm, g.H + T + tm] : []);
      fineY = [g.H, g.H + T];
    } else {
      Href = Math.min(g.H1, g.H2); yb = g.H1;
      ymax = g.H1 + T + g.H2;
      xmax = xb + 10 * ymax + (hasG ? g.G : 0);
      diel.push({ x0: -1, x1: xmax + 1, y0: 0, y1: g.H1, er: g.er1 });
      diel.push({ x0: -1, x1: xmax + 1, y0: g.H1, y1: g.H1 + T, er: g.erf != null ? g.erf : g.er2 });
      diel.push({ x0: -1, x1: xmax + 1, y0: g.H1 + T, y1: ymax, er: g.er2 });
      keysY = [g.H1, g.H1 + T];
      fineY = [g.H1, g.H1 + T];
    }
    const v = 1;
    cond.push({ x0: xa, x1: xb, y0: yb, y1: yb + T, v });
    if (hasG) cond.push({ x0: xg, x1: xmax + 10, y0: yb, y1: yb + T, v: 0 });
    const keysX = [xa, xb].concat(hasG ? [xg] : []);
    const fineX = diff ? [xa, xb] : [xb];
    if (hasG) fineX.push(xg);
    const small = Math.min(W, diff ? g.S : W, hasG ? g.G : W, Href);
    const hmin = Math.max(2e-4, Math.min(T > 0 ? T / 6 : Infinity, small / 12)) / q;
    const p = {
      xmax, ymax, leftBC: mode === 'odd' ? 'dirichlet' : 'neumann', topBC: 'ground',
      diel, cond, keysX, keysY, fineX, fineY,
      hmin, hmax: 3 * Math.max(Href, W) / q, growth: 1 + 0.18 / q,
      hmaxY: (g.type === 'micro' ? 3 * Math.max(g.H, W) : Href / 2) / q,
    };
    return p;
  }

  function capPair(g, mode, q) {
    const p = buildProblem(g, mode, q);
    const grid = makeGrid(p);
    const cd = solveCap(p, grid, true), ca = solveCap(p, grid, false);
    const k = mode === 'se' ? 2 : 1; // half domain holds half the SE trace, or one full trace of the pair
    return { C: k * cd.c * EPS0, Ca: k * ca.c * EPS0, n: grid.xs.length * grid.ys.length, iters: cd.iters + ca.iters, field: cd, grid };
  }

  function zFrom(C, Ca) { return { z: 1 / (C0 * Math.sqrt(C * Ca)), eeff: C / Ca }; }

  // single-ended line
  function analyzeSE(g, q) {
    const r = capPair(Object.assign({}, g, { S: 0 }), 'se', q);
    const z = zFrom(r.C, r.Ca);
    return { Z0: z.z, eeff: z.eeff, tpd: Math.sqrt(z.eeff) / C0 * 1e9, C: r.C, nodes: r.n, iters: r.iters, field: r.field, grid: r.grid };
  }
  // edge-coupled pair
  function analyzeDiff(g, q) {
    const o = capPair(g, 'odd', q), e = capPair(g, 'even', q);
    const zo = zFrom(o.C, o.Ca), ze = zFrom(e.C, e.Ca);
    return {
      Zodd: zo.z, Zeven: ze.z, Zdiff: 2 * zo.z, Zcm: ze.z / 2, eodd: zo.eeff, eeven: ze.eeff,
      tpdOdd: Math.sqrt(zo.eeff) / C0 * 1e9, kb: (ze.z - zo.z) / (ze.z + zo.z),
      nodes: o.n, iters: o.iters + e.iters, field: o.field, grid: o.grid,
    };
  }

  // ---------------------------------------------------------------- synthesis (root find in log space)
  function rootLog(f, target, lo, hi, tol) {
    // f monotone in [lo,hi]; returns x with f(x)=target, or null with the bracket values
    let a = Math.log(lo), b = Math.log(hi), fa = f(lo) - target, fb = f(hi) - target, n = 2;
    if (fa * fb > 0) return { x: null, fa: fa + target, fb: fb + target, n };
    let side = 0;
    for (let k = 0; k < 40; k++) {
      let c = (a * fb - b * fa) / (fb - fa);
      const fc = f(Math.exp(c)) - target; n++;
      if (Math.abs(fc) < tol) return { x: Math.exp(c), n };
      if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
      else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
      if (Math.abs(b - a) < 1e-5) return { x: Math.exp(c), n };
    }
    return { x: Math.exp((a + b) / 2), n };
  }
  // W for a target Z0 (SE) or Zdiff (diff, S fixed)
  function findW(g, target, diff, q, lo, hi) {
    const f = (W) => { const gg = Object.assign({}, g, { W }); return diff ? DIFF(gg, q).Zdiff : SE(gg, q).Z0; };
    return rootLog(f, target, lo || 0.02, hi || 3, 0.005);
  }
  // gap for a target Zdiff (W fixed)
  function findS(g, target, q, lo, hi) {
    const f = (S) => DIFF(Object.assign({}, g, { S }), q).Zdiff;
    return rootLog(f, target, lo || 0.03, hi || 3, 0.005);
  }

  // Richardson extrapolation from meshes q and 2q (order 1.5 with thick copper, 1 for zero thickness)
  function rich(fn, g, q) {
    q = q || 1;
    const a = fn(g, q), b = fn(g, 2 * q), f = 1 / (Math.pow(2, g.T > 0 ? 1.5 : 1) - 1), out = Object.assign({}, b);
    for (const k of ['Z0', 'Zodd', 'Zeven', 'Zdiff', 'Zcm', 'eeff', 'eodd', 'eeven', 'tpd', 'tpdOdd'])
      if (typeof b[k] === 'number') out[k] = b[k] + (b[k] - a[k]) * f;
    if (out.Zodd) out.kb = (out.Zeven - out.Zodd) / (out.Zeven + out.Zodd);
    out.meshDelta = Math.abs((b.Z0 || b.Zdiff) / (a.Z0 || a.Zdiff) - 1);
    return out;
  }
  const SE = (g, q) => rich(analyzeSE, g, q), DIFF = (g, q) => rich(analyzeDiff, g, q);

  // Most compact geometry inside target*(1 +/- tol): narrowest W (single-ended) or smallest 2W+S (pair).
  // Z falls with W and rises with S, so the optimum always sits on a corner: W = wmin or S = smin.
  // o: {target, tol (fraction), diff, wmin, smin, step, q}
  function compact(g, o) {
    const q = o.q || 1, step = o.step || 0.005, Zlo = o.target * (1 - o.tol), Zhi = o.target * (1 + o.tol);
    const up = (v) => +(Math.ceil(v / step - 1e-6) * step).toFixed(4);
    const zse = (W) => SE(Object.assign({}, g, { W }), q).Z0;
    const zd = (W, S) => DIFF(Object.assign({}, g, { W, S }), q).Zdiff;
    if (!o.diff) {
      const z0 = zse(o.wmin);
      if (z0 < Zlo) return { ok: false, why: 'low', z: z0 };
      let W = o.wmin, z = z0, bound = 'wmin';
      if (z0 > Zhi) {
        const r = rootLog(zse, Zhi, o.wmin, 4, 0.01);
        if (!r.x) return { ok: false, why: 'nf' };
        W = up(r.x); z = zse(W); bound = 'zhi';
        for (let k = 0; k < 3 && z > Zhi; k++) { W = +(W + step).toFixed(4); z = zse(W); }
      }
      return { ok: true, W, z, F: W, bound };
    }
    const z00 = zd(o.wmin, o.smin);
    let W = o.wmin, S = o.smin, z = z00, bound = 'corner';
    if (z00 > Zhi) {
      const r = rootLog((w) => zd(w, o.smin), Zhi, o.wmin, 4, 0.01);
      if (!r.x) return { ok: false, why: 'nf' };
      W = up(r.x); z = zd(W, S); bound = 'zhi';
      for (let k = 0; k < 3 && z > Zhi; k++) { W = +(W + step).toFixed(4); z = zd(W, S); }
    } else if (z00 < Zlo) {
      const r = rootLog((s) => zd(o.wmin, s), Zlo, o.smin, 8, 0.01);
      if (!r.x) return { ok: false, why: 'low', z: r.fb };
      S = up(r.x); z = zd(W, S); bound = 'zlo';
      for (let k = 0; k < 3 && z < Zlo; k++) { S = +(S + step).toFixed(4); z = zd(W, S); }
    }
    return { ok: true, W, S, z, F: 2 * W + S, bound };
  }

  const api = { compact, SE, DIFF, rich, analyzeSE, analyzeDiff, findW, findS, buildProblem, makeGrid, solveCap, C0, EPS0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ZSolver = api;
})(typeof self !== 'undefined' ? self : this);
