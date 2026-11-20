# LordOfTheOhms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, browser-only PCB impedance calculator built on the ported and generalised 2D field solver, deployed on Vercel as LordOfTheOhms.

**Architecture:**
- **Pure TypeScript core:**
  - solver: grid, FV solve, Richardson, synthesis;
  - model: stackup, cross-section builder, units, materials;
  - io: JSON, URL hash, storage, KiCad import, CSV.
- **Workers:** the core runs inside a pool of Web Workers.
- **UI:** a React UI drives the core through a typed message protocol.
- **Tests:** the core is tested in Node with Vitest against the legacy JS and against closed-form references.

**Tech Stack:**
- Vite, React 18, TypeScript (strict);
- Vitest (+ @testing-library/react, jsdom, for a few UI tests);
- lz-string for the URL hash;
- no backend.

**Spec:** `docs/superpowers/specs/2026-11-20-lordoftheohms-design.md`. Read it before starting. Local-only references, with absolute paths, are listed in `reference/HANDOFF.md`; that file is not in git.

## Global Constraints

**Content and data**
- All lengths are in **mm** in the model, the JSON, the URL state and the solver. Units are display-only: mil = 0.0254 mm, µm = 0.001 mm.
- **English UI.** No backend, no database, no analytics.
- Never commit company or board content (company or board names, the original tables, header line, netclass names, file paths, dated notes, the original page HTML), personal data (names, emails, local paths, account usernames), or anything under `reference/`.

**Commits**
- Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commits use the repo-local noreply email; do not change git config.
- Run `git remote -v` before any push. It must show `git@github.com:RaffaeleBiondi/Impedance_calculator.git`.

**Tooling**
- npm only, with no global installs.
- `package.json` `"type": "module"` and `"engines": { "node": ">=22" }`. Vercel runs Node 26.x.

**Defaults from the spec**
- Etch mode `rect`; rule `{ by: 'fraction', value: 0.7 }`, labelled "placeholder rule of thumb — use your fab's value" until a citable source is found.
- Trapezoid: 8 slices.
- Solder mask: a single conformal thickness.
- Width-table classes "SE 50" (se, 50 Ω), "DIFF 100" (diff, 100 Ω), "DIFF 90" (diff, 90 Ω), rule `compact at target`, plus the extra "most compact within ±tol" column (default tol 5 %).
- Mesh: normal q = 1, fine q = 2. Richardson pairs (q, 2q).
- Default calculator state: In5.Cu, SE, W 0.135, target 50, fab minimum 0.125, mesh fine, tolerance 5 %, frequency 1 GHz.

**Tolerances**
- V0 and V2 ≤ 1e-9 relative.
- V1 ±0.02 Ω.
- Other validation acceptances exactly as in spec §7.

## Review Focus

1. **Unreachable synthesis targets:** a target the line cannot reach, or one needing W or gap below the fab minimum, must end with a clear message and the reachable Z range, never a hang or a NaN. Owner: Task 8.
2. **Corrupted, truncated or outdated state:** a bad URL hash, a bad JSON file, or a missing or blocked localStorage must fall back to the next source (hash → storage → example), with a visible notice and no blank page. Owner: Task 10.
3. **Extreme geometry ratios:** for example W 0.02 mm over 3 mm of dielectric, G 10 mm, or 0.5 µm copper. These must finish within the node cap, or be refused with a "geometry too large/small for the solver" message. Owner: Task 5.
4. **Edits that invalidate the selection:** deleting or re-roling the selected signal layer or a chosen reference must move the selection to valid defaults with a notice. Owner: Task 13.
5. **Repeated unit switching:** the stored mm values must not drift (mm → mil → µm → mm keeps the exact number). Owners: Task 3 (units) and Task 13 (inputs).

---

## Phase A — Foundation and verbatim port

### Task 1: Project scaffold, legacy golden source, CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `vercel.json`, `.github/workflows/ci.yml`, `.nvmrc`
- Create: `tests/legacy/zsolver.legacy.cjs` (byte copy of `reference/artifact/zsolver.js`; the `.cjs` extension is needed because the package is ESM)
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces:
  - npm scripts `dev`, `build` (`tsc -b && vite build`), `test` (fast suite), `test:validation` (slow `*.validation.test.ts`), `bench`;
  - `tests/helpers/legacy.ts`, exporting `legacy`: the legacy module loaded via `createRequire(import.meta.url)`.

- [ ] **Step 1:** Scaffold Vite React-TS by hand (no `npm create`, to keep the existing files). Add dev deps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `tsx`. Add dep: `lz-string`.
- [ ] **Step 2:** Copy the legacy solver and verify `shasum tests/legacy/zsolver.legacy.cjs` = `62569c865ca71fae9aaf5707750cff873ec87daa`.
- [ ] **Step 3: Write `tests/smoke.test.ts`:**
  - `legacy.SE({type:'strip',T:0.018,H1:0.2,er1:4.35,H2:0.14,er2:3.93,erf:3.93,G:null,W:0.135},2).Z0` is within 0.005 of 50.03;
  - `legacy.SE({type:'micro',T:0.035,H:0.12,er:4.17,tm:0.01,erm:3.3,G:null,W:0.20},2).Z0` is within 0.005 of 50.36.
- [ ] **Step 4:** Configure Vitest:
  - `test.include` = `tests/**/*.test.ts(x)`, excluding `*.validation.test.ts` unless `VALIDATION=1`;
  - `environment: 'node'` by default, with jsdom per file via a `// @vitest-environment jsdom` comment.
- [ ] **Step 5:** Write `vercel.json` = `{ "framework": "vite", "buildCommand": "npm run build", "outputDirectory": "dist" }` and `.nvmrc` = `22`.
- [ ] **Step 6:** Write the CI workflow: on push/PR, Node 22, `npm ci && npm test && npm run test:validation && npm run build`.
- [ ] **Step 7:** Run `npm test` → smoke PASS; `npm run build` → `dist/index.html` exists.
- [ ] **Step 8:** Commit `chore: scaffold Vite + React + TS, legacy solver as golden source, CI`. Do not push yet: the push would trigger the first Vercel build. Push in Task 17, or earlier if the owner asks.

### Task 2: Verbatim TypeScript port of the solver core (V0, V3, V5)

**Files:**
- Create: `src/solver/types.ts`, `src/solver/grid.ts`, `src/solver/fv.ts`, `src/solver/line.ts`, `src/solver/synth.ts`, `src/solver/elliptic.ts`
- Test: `tests/solver/port.test.ts` (V0, fast subset), `tests/solver/legacy-refs.validation.test.ts` (V3, V5), `tests/helpers/refs.ts` (reference formulas, spec Appendix A)

**Interfaces:**
- Produces (`types.ts`):

  ```ts
  export interface Rect { x0: number; x1: number; y0: number; y1: number }
  export interface DielRect extends Rect { er: number; tand?: number }   // tand undefined = 0
  export interface CondRect extends Rect { v: 0 | 1 }
  export type Mode = 'se' | 'odd' | 'even';
  export interface Problem { xmax: number; ymax: number; leftBC: 'neumann' | 'dirichlet'; topBC: 'ground' | 'neumann';
    diel: DielRect[]; cond: CondRect[]; keysX: number[]; keysY: number[]; fineX: number[]; fineY: number[];
    hmin: number; hmax: number; hminX?: number; hmaxX?: number; hmaxY?: number; growth: number }
  export interface Grid { xs: Float64Array; ys: Float64Array }
  export interface CapResult { c: number; V: Float64Array; iters: number; nx: number; ny: number }
  export type BuildFn = (mode: Mode, q: number) => Problem;
  export interface FieldData { V: Float64Array; xs: Float64Array; ys: Float64Array }
  export interface SEResult { Z0: number; eeff: number; tpd: number /* ns/m = ps/mm */; C: number; nodes: number; iters: number; field: FieldData; meshDelta?: number }
  export interface DiffResult { Zodd: number; Zeven: number; Zdiff: number; Zcm: number; eodd: number; eeven: number; tpdOdd: number; kb: number; nodes: number; iters: number; field: FieldData; meshDelta?: number }
  ```
- Produces (functions):
  - `grid.ts`: `buildAxis(keys, fines, hmin, hmax, growth, minCells): Float64Array` and `makeGrid(p: Problem): Grid`;
  - `fv.ts`: `solveCap(p: Problem, g: Grid, useDiel: boolean): CapResult`;
  - `line.ts`: `analyzeSE(build: BuildFn, q: number): SEResult`, `analyzeDiff(build, q): DiffResult`, `richSE(build, q, order: number): SEResult`, `richDiff(build, q, order): DiffResult`. `order` = 1.5 for T > 0, 1 for T = 0, as in legacy `rich`;
  - `synth.ts`: `rootLog(f, target, lo, hi, tol): { x: number | null; fa?: number; fb?: number; n: number }` and `compact(o: { target: number; tol: number; diff: boolean; wmin: number; smin: number; step: number }, zse?: (W: number) => number, zd?: (W: number, S: number) => number): CompactResult`, where `CompactResult = { ok: true; W: number; S?: number; z: number; F: number; bound: 'wmin' | 'corner' | 'zhi' | 'zlo' } | { ok: false; why: 'low' | 'nf'; z?: number }`;
  - `elliptic.ts`: `ellipK(k: number): number`, AGM with 40 iterations.

- [ ] **Step 1: Write `tests/solver/port.test.ts` (V0).**
  - For each case in the table below, build with `(mode, q) => legacy.buildProblem({...g, S: mode === 'se' ? 0 : g.S}, mode, q)` and compare `richSE`/`richDiff` with `legacy.SE`/`legacy.DIFF`. Every numeric field must be within ≤ 1e-9 relative.
  - Synthesis: compare TS `rootLog`-based findW against `legacy.findW(g, 50, false, 1, 0.02, 3)`, and TS `compact` against `legacy.compact(g, {target:100, tol:0.05, diff:true, wmin:0.125, smin:0.125, step:0.005, q:1})`, both on strip-In5. Same x / same W, S and bound.

  | Name | g | Kind | q |
  |---|---|---|---|
  | strip-In5 | `{type:'strip',T:0.018,H1:0.2,er1:4.35,H2:0.14,er2:3.93,erf:3.93,G:null,W:0.135}` | se | 1, 2 |
  | micro-F | `{type:'micro',T:0.035,H:0.12,er:4.17,tm:0.01,erm:3.3,G:null,W:0.20}` | se | 1, 2 |
  | micro-F-cpw | micro-F + `G:0.15` | se | 1 |
  | micro-T0 | `{type:'micro',T:0,H:0.12,er:3.9,tm:0,erm:1,G:null,W:0.12}` | se | 1 |
  | strip-diff | strip-In5 + `W:0.125,S:0.315` | diff | 1, 2 |
  | micro-diff | micro-F + `W:0.17,S:0.27` | diff | 1 |
  | micro-diff-cpw | micro-F + `W:0.21,S:0.25,G:0.3` | diff | 1 |
- [ ] **Step 2:** Run `npx vitest run tests/solver/port.test.ts` → FAIL (modules missing).
- [ ] **Step 3:** Port `uniqSorted`, `buildAxis`, `makeGrid`, `solveCap` (IC(0)-PCG, energy), `capPair`/`zFrom` (inside `line.ts`), `rich`, `rootLog` and `compact` from `tests/legacy/zsolver.legacy.cjs`, statement for statement. Keep the same loop order and float operations so results stay within 1e-9.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Write `tests/helpers/refs.ts`:** `cohnStrip(W,b,er)`, `cohnCoupled(W,S,b,er): {zoe, zoo}`, `hjMicrostrip(u,er): {z0, eeff}`, `cpwInfinite(W,G,er): {z0, eeff}`, exactly per spec Appendix A.
- [ ] **Step 6: Write `tests/solver/legacy-refs.validation.test.ts`.** Use legacy builders through the TS core. Assertions:
  - **V3:** coupled stripline (W 0.15, S 0.25, b 0.4, εr 4, T 0, q 4): Zodd and Zeven errors within [−0.1 %, 0];
  - **V5:** microstrip vs HJ (u ∈ {0.5, 1, 2}, H 0.12, εr 3.9, T 0, tm 0, q 4, dom ∈ {1, 2}): |err| ≤ 0.2 %, with the values of spec Appendix B reproduced to 3 decimals.
- [ ] **Step 7:** Run `VALIDATION=1 npx vitest run tests/solver/legacy-refs.validation.test.ts` → PASS.
- [ ] **Step 8:** Commit `feat(solver): verbatim TypeScript port of the FV solver, golden-tested against the legacy JS`.

## Phase B — Generalised model and solver

### Task 3: Stackup model, validation, units, example

**Files:**
- Create: `src/model/stackup.ts`, `src/model/units.ts`, `src/model/example.ts`
- Test: `tests/model/stackup.test.ts`, `tests/model/units.test.ts`

**Interfaces:**
- Produces:
  - the types `Role`, `EtchRule`, `CopperLayer`, `DielectricLayer`, `Mask`, `Stackup` exactly as in spec §6.1;
  - `validateStackup(s: Stackup): { level: 'error' | 'warning'; msg: string; layerId?: string }[]`;
  - `coppers(s): CopperLayer[]`;
  - `defaultRefs(s, layerId): { above: string | null; below: string | null }`;
  - `etchReduction(s, layerId): number`, the mm reduction W − W_top using the override or the stackup rule with the layer's own T;
  - `units.ts`: `type Unit = 'mm' | 'mil' | 'um'`, `toDisplay(mm: number, u: Unit): number`, `fromDisplay(v: number, u: Unit): number`, `formatLen(mm, u, digits?)`;
  - `example.ts`: `exampleStackup(): Stackup`, exactly the spec §6.8 table, with ids `cu0..cu9` and `d0..d8`.

- [ ] **Step 1: Write the tests.**
  - `validateStackup(exampleStackup())` returns `[]`.
  - Two coppers with no dielectric between them → error.
  - A dielectric t ≤ 0 → error.
  - A stackup starting with a dielectric → error.
  - `defaultRefs(example,'cu5')` = `{above:'cu4', below:'cu6'}`; `defaultRefs(example,'cu0')` = `{above:null, below:'cu1'}`; `defaultRefs(example,'cu2')` = `{above:'cu1', below:'cu3'}`.
  - `etchReduction` with fraction 0.7: cu0 → 0.0245, cu5 → 0.0126. With `etchOverride {by:'factor', value:2}` on cu5: 0.018 (= 2·0.018/2).
  - Units: `fromDisplay(toDisplay(0.135,'mil'),'mil') === 0.135`. Inputs keep the mm value and only round at display, so assert that the round-trip function used by inputs returns the stored number unchanged.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(model): stackup types, validation, units, example stackup`.

### Task 4: Cross-section builder (spec §6.2)

**Files:**
- Create: `src/model/crossSection.ts`
- Test: `tests/model/crossSection.test.ts`

**Interfaces:**
- Consumes: Task 3 types and `defaultRefs`.
- Produces:

  ```ts
  export interface Slab { t: number; er: number; tand: number; label: string }
  export type Topology = 'microstrip' | 'embedded-microstrip' | 'stripline-symmetric' | 'stripline-asymmetric' | 'no-reference';
  export interface CrossSection {
    T: number;                       // trace copper (mm)
    base: Slab[];                    // index 0 touches the trace base, outward
    cover: Slab[];                   // index 0 sits on top of the trace layer, outward (inner traces only)
    fill: { er: number; tand: number } | null;   // inner: cover-side dielectric; outer: null
    outer: boolean;                  // trace on a board surface: conformal mask + air on the cover side
    coverMask: Mask | null;          // conformal mask when outer
    baseRef: boolean; coverRef: boolean;          // plane at the far end of base / cover
    baseOpenMask: Mask | null; coverOpenMask: Mask | null;   // flat mask at the board surface when a side is open
    flipped: boolean;                // true when base is the dielectric above in stackup order
    topology: Topology; notes: string[]; warnings: string[];
  }
  export interface Selection { layerId: string; refAbove: string | null; refBelow: string | null }
  export function buildCrossSection(s: Stackup, sel: Selection): { ok: true; xs: CrossSection } | { ok: false; error: string };
  ```

- [ ] **Step 1: Write the tests (spec §6.2 rules).**
  - **Example, cu5 (In5), default refs:**
    - base = [{t:0.2, er:4.35}] (core below);
    - fill = {er:3.93};
    - cover = [{t:0.14, er:3.93}];
    - baseRef and coverRef = true;
    - topology `stripline-asymmetric`, flipped = false.
  - **Example, cu7 (In7):** base = core d7 below, cover = prepreg d6, flipped = false.
  - **Example, cu2 (In2):** neighbours d1 (core, above) and d2 (prepreg, below) → base = d1, flipped = true.
  - **Example, cu0 (F.Cu), refBelow cu1:** outer, base = [{t:0.12, er:4.17}], coverMask = {t:0.01, er:3.3}, topology `microstrip`.
  - **Example, cu9 (B.Cu):** base = d8, flipped = true, microstrip.
  - **Skip:** cu5 with refAbove cu3 (skipping cu4):
    - cover = [prepreg 0.14/3.93, copper-fill 0.018 with the εr of the adjacent prepreg (d4 → 3.93), core d3 0.2/4.35];
    - the notes contain "In4.Cu assumed cut out".
  - **Embedded:** cu5 with refAbove null → cover slabs continue to the top surface (d4…d0 with the skipped coppers as fills), coverOpenMask = maskTop, topology `embedded-microstrip`.
  - **No reference:** cu0 with refBelow null → topology `no-reference`.
  - **Signal reference:** cu5 with refBelow cu7 (role signal) → ok, with a warning containing "signal".
  - **Wrong side:** cu5 with refBelow cu3 → error.
  - **Base override:** a layer with `base:'above'` and both neighbours prepreg → flipped = true.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `buildCrossSection`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(model): cross-section builder with references, skipped layers and base rule`.

### Task 5: Generalised problem builder: keyed mask walls, trapezoid, CPW, open sides (V1, V2, V7, V8, V13)

**Files:**
- Create: `src/solver/problem.ts`, `src/solver/engine.ts`
- Modify: `src/solver/grid.ts` (node cap)
- Test: `tests/solver/problem.test.ts` (V2, V8, V13 limits, node cap), `tests/solver/regression.test.ts` (V1), `tests/solver/convergence.validation.test.ts` (V7, V13 convergence)

**Interfaces:**
- Consumes: `CrossSection` (Task 4); `makeGrid`, `richSE`, `richDiff` (Task 2).
- Produces:

  ```ts
  export interface LineGeom { W: number; S?: number; G?: number | null; Wtop?: number; slices?: number }   // Wtop undefined = rectangle
  export function buildProblem(xs: CrossSection, line: LineGeom, mode: Mode, q: number, opts?: { dom?: number }): Problem;
  export const MAX_NODES = 400_000;   // makeGrid throws GeometryError('too large') above this
  export class GeometryError extends Error {}
  // engine.ts
  export interface LineSpec { type: 'se' | 'diff'; W: number; S?: number; G?: number | null; etch: boolean }
  export interface AnalyzeRequest { stackup: Stackup; sel: Selection; line: LineSpec; q: number; freqGHz?: number }
  export type AnalyzeResult = { ok: true; kind: 'se'; r: SEResult; xs: CrossSection; wtop?: number; lossDbPerM?: number }
                            | { ok: true; kind: 'diff'; r: DiffResult; oddOnly: boolean; xs: CrossSection; wtop?: number; lossDbPerM?: number }
                            | { ok: false; error: string };
  export function analyze(req: AnalyzeRequest): AnalyzeResult;
  export function makeBuild(xs: CrossSection, line: LineGeom, dom?: number): BuildFn;
  ```

**Approach notes:**
- Start from legacy `buildProblem`. When the cross-section is legacy-shaped, emit the same `keysX`, `keysY`, `fineX`, `fineY`, `hmin`, `hmax`, `hmaxY`, `growth`, `xmax`, `ymax`. Legacy-shaped means: one base slab and outer, or base[1] + fill + cover[1] with both refs.
- Then add x keys and fine points at every mask wall (xa − tm, xb + tm, xg − tm), every slice edge and every coplanar-GND slice edge.
- Open sides: stack slabs from y = 0 (the far boundary, grounded) as air of depth `dom·max(30·H, 6·W)`, open mask, base slabs, trace, … so `solveCap` stays unchanged (`topBC: 'ground'` at the far top). H is the base-side dielectric thickness.
- `oddOnly` = topology `no-reference` and no G. SE in that case → `{ ok:false, error:'No reference: single-ended needs a plane or coplanar GND' }`.
- Trapezoid:
  - Wtop = W − `etchReduction`;
  - each of the N slices has half-width interpolated at its mid-height, with the wide side on the base;
  - the coplanar GND edges get the same taper;
  - the conformal mask follows each slice + tm.
- Richardson `order`: 1.5 for T > 0, 1 for T = 0, unless V13 measures a materially different order for trapezoids. In that case add `order` to `makeBuild`'s result and record it in `docs/validation.md`.

- [ ] **Step 1: Write `tests/solver/problem.test.ts`.**
  - **V2:**
    - example cu5 SE W 0.135 and diff 0.125/0.315 (unmasked stripline) at q 1 and 2: `makeGrid(buildProblem(...))` xs/ys equal legacy's element-wise (≤ 1e-12), and Z ≤ 1e-9 relative to `legacy.SE`/`legacy.DIFF`;
    - the same for microstrip with `maskTop.t = 0`.
  - **V8:** stackups where every εr = 4 (microstrip with mask εr 4 is not homogeneous, so use stripline and embedded with all εr 4, and CPW-in-stripline) → `eeff` within 1e-4 of 4.
  - **V13 limits:**
    - Wtop = W gives the same Z as rect (≤ 1e-9);
    - rect(Wtop) ≥ trap ≥ rect(W) in Z, for F.Cu SE 0.20 and cu5 SE 0.135 with reduction 0.7·T.
  - **Node cap:** W 0.02 with base slab 3 mm and q 2 → `analyze` returns `{ok:false}` with "too large", or succeeds under 400k nodes. Pin whichever the cap yields, and assert no hang (test timeout 20 s).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `problem.ts`, `engine.ts` and the node cap.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Re-baseline V1.** Write `scripts/baseline.ts`, which prints Z for the five V1 cases with the new builder at q 2, plus rich(2,4) vs rich(4,8). Run `npx tsx scripts/baseline.ts`. Expected:
  - In5 SE 0.135 → 50.03 ± 0.02;
  - In5 diff 0.125/0.315 → 100.79 ± 0.02;
  - F.Cu SE 0.20 → 50.31 ± 0.02;
  - each masked case converged to ≤ 0.02 %.
- [ ] **Step 6: Write `tests/solver/regression.test.ts` (V1).** It asserts the five printed values to ±0.02 Ω. Add a comment beside each masked case with the legacy value (50.36 / 100.78 / 90.18).
- [ ] **Step 7: Write `tests/solver/convergence.validation.test.ts` (V7, V13).**
  - V7: rich(1,2) vs rich(2,4) ≤ 0.3 % for the six spec Appendix B cases (built through the new builder) and for one case per new topology: embedded, skip-layer, CPW no ground, CPWG, trapezoid SE and diff, masked trapezoid.
  - V13: 8 vs 16 slices ≤ 0.1 %, and the observed order from three meshes printed and recorded.
- [ ] **Step 8:** Run `npm test` and `VALIDATION=1 npx vitest run tests/solver` → PASS.
- [ ] **Step 9:** Write `scripts/bench.ts` (the `npm run bench` script). It times cu5 SE at q 1 and q 2, and F.Cu diff at q 2, through `analyze`. Run it; expected roughly ≤ 1.2× the legacy budget in spec §6.3 (SE normal ≈ 35 ms, SE fine ≈ 130–180 ms, pair fine ≈ 0.5 s). Record the numbers in the commit message.
- [ ] **Step 10:** Commit `feat(solver): generalised problem builder (keyed mask walls, trapezoid slices, CPW, open sides)`.

### Task 6: Reference validations for new geometries and validation report (V4, V6, V9–V12, V15)

**Files:**
- Modify: `tests/helpers/refs.ts`. Add:
  - Kirschning-Jansen coupled microstrip;
  - a Wadell offset-stripline formula;
  - an embedded-microstrip approximation (Wadell or IPC-2141A);
  - Ghione / Veyres–Fouad Hanna CPW and CPWG on a finite substrate.
  Each gets a JSDoc citing the source and its stated accuracy.
- Create: `tests/solver/references.validation.test.ts`, `scripts/validation-report.ts`, `docs/validation.md` (generated)
- Test: as above

**Interfaces:**
- Consumes: `analyze`/`makeBuild` (Task 5), `refs.ts`.
- Produces: `docs/validation.md`, plus `src/validation.json` (the same rows, imported by the UI in Task 16): `{ id, test, reference, result, acceptance, status: 'pass' | 'deviation-recorded' | 'not-validated' }[]`.

- [ ] **Step 1: Write the tests, acceptances per spec §7.**
  - **V4:** Cohn single stripline, W ∈ {0.1, 0.2, 0.4}, b 0.4, εr 4, T 0, q 2: |err| ≤ 0.15 %.
  - **V6:** KJ, T 0, no mask, H 0.12, εr 3.9, W/H ∈ {0.5, 1, 2}, S/H ∈ {0.5, 1, 2}: within KJ's stated accuracy.
  - **V9:** asymmetric stripline. With H1 = H2 it equals Cohn to ≤ 0.15 %; with H1 ≠ H2, within the cited formula's accuracy.
  - **V10:** embedded microstrip. A cover of 1e-6 mm (or none) equals microstrip to ≤ 0.1 %; otherwise within the cited approximation's accuracy.
  - **V11:** CPW, no ground: substrate 20·(W+2G), T 0, W 0.2, G 0.1, εr 4 vs `cpwInfinite`, ≤ 0.3 %; record dom 1 vs 2.
  - **V12:** CPW on a finite substrate, and CPWG, within ~1 %, recorded.
  - **V15:** mask t = 0 reproduces no-mask exactly; Z decreases monotonically as mask t ∈ {0, 5, 10, 20} µm and εr ∈ {3, 3.5, 4} increase.
- [ ] **Step 2:** Run with `VALIDATION=1`. If a check fails, apply the spec §5 policy:
  - investigate with a second reference and the V7 convergence;
  - if the solver holds, record the deviation (`status: 'deviation-recorded'`) instead of loosening the test silently;
  - write the reasoning into `docs/validation.md`.
- [ ] **Step 3:** Write `scripts/validation-report.ts`. It runs the V-cases and writes `docs/validation.md` (a table plus notes, including the legacy → new shifts for the masked V1 cases) and `src/validation.json`.
- [ ] **Step 4:** Run `npx tsx scripts/validation-report.ts` → both files are written, with no `fail` rows.
- [ ] **Step 5:** Commit `test(solver): reference validations for all geometries + validation report`.

### Task 7: Dielectric loss, delay and skew (V14)

**Files:**
- Modify: `src/solver/fv.ts` (energy split), `src/solver/line.ts` (`tandEff` in results), `src/solver/engine.ts` (`lossDbPerM`)
- Create: `src/solver/derived.ts`
- Test: `tests/solver/loss.test.ts`

**Interfaces:**
- Produces:
  - `CapResult.tandEff?: number`, computed only when `useDiel`, as Σ W_cell·tanδ_cell / W_total. Each edge energy term is split between its two adjacent cells with their weights.
  - `SEResult.tandEff` and `DiffResult.tandEffOdd`.
  - `derived.ts`:
    - `alphaDbPerM(fGHz, eeff, tandEff): number` = 8.686·π·f·√eeff·tandEff / c;
    - `delayPs(tpdPsPerMm, Lmm): number`;
    - `skewPs(tpdPsPerMm, L1mm, L2mm): number`.
  - `AnalyzeResult.lossDbPerM`, present when `freqGHz` > 0.
  - Richardson applies to `tandEff` like the other scalar fields.
- V0 must still pass: the new field must not change existing numbers.

- [ ] **Step 1: Write the tests.**
  - Homogeneous stripline (εr 4, tanδ 0.02, W 0.15, b 0.4, f 1 GHz) → `lossDbPerM` within 0.1 % of 8.686·π·1e9·2·0.02/c.
  - Single-dielectric microstrip (εr 4.0, tanδ 0.02, no mask): tandEff within 0.5 % of (εr/εeff)·(∂εeff/∂εr)·tanδ, with ∂εeff/∂εr by central difference (εr ± 0.01).
  - `skewPs(7, 100, 98)` = 14; `delayPs(7, 0)` = 0.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` (V0 included) → PASS.
- [ ] **Step 5:** Commit `feat(solver): dielectric loss from field-energy partition, delay and skew helpers`.

### Task 8: Synthesis on the generalised engine, and width-table cells

**Files:**
- Create: `src/solver/synthesis.ts`
- Test: `tests/solver/synthesis.test.ts`

**Interfaces:**
- Consumes: `analyze`, `rootLog`, `compact` (Tasks 2 and 5).
- Produces:

  ```ts
  export type SynthResult = { ok: true; W: number; S?: number; z: number; result: AnalyzeResult; bound?: string }
                          | { ok: false; reason: 'out-of-range' | 'below-fab' | 'no-reference' | 'error'; zRange?: [number, number]; message: string };
  export function findW(req: AnalyzeRequest, target: number, lo = 0.02, hi = 4): SynthResult;
  export function findS(req: AnalyzeRequest, target: number, lo = 0.02, hi = 6): SynthResult;
  export function compactWithinTol(req: AnalyzeRequest, o: { target: number; tol: number; fmin: number; step?: number }): SynthResult & { message?: string };
  export function compactAtTarget(req: AnalyzeRequest, target: number, fmin: number): SynthResult;
  export type GapRule = { kind: 'compact-at-target' } | { kind: 'fixed-gap'; gap: number } | { kind: 'fixed-pitch'; pitch: number };
  export function tableCell(req: AnalyzeRequest, target: number, rule: GapRule, fmin: number, tol: number): { main: SynthResult; compact: SynthResult };
  export function roundToStep(v: number, step: number): number;   // nearest
  ```

**Behaviour:**
- `compactAtTarget`:
  - SE: findW;
  - diff: W = fmin, then findS. If the resulting S < fmin, set S = fmin and run findW. If neither reaches the target, return `out-of-range` with the reachable range.
- `fixed-pitch`: findW with S = pitch − W inside the evaluator, keeping W < pitch − fmin.
- Messages: the English translations of the original page's synthesis and compact messages (see `reference/HANDOFF.md`). The wording is the implementer's.

- [ ] **Step 1: Write the tests** (example stackup, mesh q 1 for speed).
  - `findW` for cu5 SE 50 → W within 0.002 of 0.135.
  - `findW` with target 500 → `ok:false`, reason `out-of-range`, `zRange` defined, `message` mentioning both bounds.
  - `compactAtTarget` cu5 diff 100, fmin 0.125 → W = 0.125, S between 0.30 and 0.33, |z − 100| ≤ 0.5.
  - `compactAtTarget` F.Cu diff 90, fmin 0.125: assert |z − 90| ≤ 0.45, plus W ≥ 0.125 and S ≥ 0.125.
  - `compactWithinTol` cu5 SE target 50, tol 0.05, fmin 0.125 → W 0.125 (bound `wmin`), matching the legacy table's "0.125".
  - `tableCell` with `fixed-pitch` 0.44 on cu5 diff 100 → W + S = 0.44 ± 1e-9.
  - `roundToStep(0.1374, 0.005)` = 0.135.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(solver): synthesis (findW, findS, compact) and width-table cells on the generalised engine`.

### Task 9: Worker protocol and pool

**Files:**
- Create: `src/solver/protocol.ts`, `src/solver/worker.ts`, `src/solver/pool.ts`
- Test: `tests/solver/protocol.test.ts`, `tests/solver/pool.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export type Job =
    | { op: 'analyze'; req: AnalyzeRequest }
    | { op: 'findW'; req: AnalyzeRequest; target: number }
    | { op: 'findS'; req: AnalyzeRequest; target: number }
    | { op: 'compact'; req: AnalyzeRequest; target: number; tol: number; fmin: number }
    | { op: 'sweepPoint'; req: AnalyzeRequest; param: 'W' | 'S'; value: number }
    | { op: 'tableCell'; req: AnalyzeRequest; target: number; rule: GapRule; fmin: number; tol: number };
  export function handleJob(job: Job): unknown;   // pure, used by worker.ts and tests
  export class SolverPool {
    constructor(size?: number, factory?: () => WorkerLike);   // default size clamp(hardwareConcurrency - 1, 1, 8)
    run<T>(job: Job): { promise: Promise<T>; cancel(): void };
    runBatch<T>(jobs: Job[], onProgress?: (done: number, total: number) => void): { promise: Promise<T[]>; cancel(): void };
    dispose(): void;
  }
  ```
- Rules:
  - `cancel()` terminates the busy worker and respawns it;
  - field arrays are posted as transferables;
  - `worker.ts` = `self.onmessage = e => postMessage({ id, ok, res | err })` around `handleJob`;
  - create workers with `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.

- [ ] **Step 1: Write the tests.**
  - `handleJob({op:'analyze', ...cu5 SE})` returns Z0 within 0.02 of 50.03 (q 2).
  - A pool with a fake `WorkerLike` factory: `runBatch` of 5 jobs on size 2 resolves in order and calls `onProgress` 5 times.
  - `cancel()` on a pending job rejects with `'cancelled'` and calls `terminate` on the fake worker, which is then replaced.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(solver): worker protocol and cancellable worker pool`.

## Phase C — Persistence, import, materials

### Task 10: JSON, URL hash, storage, app state schema

**Files:**
- Create: `src/state/types.ts`, `src/io/json.ts`, `src/io/urlState.ts`, `src/io/storage.ts`, `src/io/load.ts`
- Test: `tests/io/json.test.ts`, `tests/io/urlState.test.ts`, `tests/io/load.test.ts`

**Interfaces:**
- Produces:

  ```ts
  // state/types.ts
  export interface CalcState { layerId: string; refAbove: string | null; refBelow: string | null; type: 'se' | 'diff'; cpw: boolean;
    W: number; S: number; G: number; target: number; fmin: number; tol: number; compact: boolean; q: 1 | 2; etch: boolean;
    freqGHz: number; L1: number | null; L2: number | null }
  export interface ImpClass { id: string; name: string; type: 'se' | 'diff'; target: number; rule: GapRule; G: number | null }
  export interface AppState { stackup: Stackup; calc: CalcState; unit: Unit; classes: ImpClass[]; tableLayers: string[] }
  export function defaultAppState(): AppState;   // spec §6.8 defaults + the three pre-loaded classes
  // io
  export function parseStackupJson(text: string): { ok: true; stackup: Stackup } | { ok: false; errors: string[] };
  export function serializeStackup(s: Stackup): string;   // pretty JSON, schema 'lordoftheohms/stackup@1'
  export function encodeHash(st: AppState): string;       // '#s=' + lz-string compressToEncodedURIComponent(JSON)
  export function decodeHash(hash: string): { ok: true; state: AppState } | { ok: false; error: string };
  export const storage: { get<T>(key: string): T | null; set(key: string, v: unknown): boolean; remove(key: string): void };   // try/catch everywhere
  export function loadInitialState(hash: string, store: typeof storage): { state: AppState; source: 'hash' | 'storage' | 'example'; notice?: string };
  ```
- Storage keys: `lotO.autosave`, `lotO.saved` (`Record<name, Stackup>`), `lotO.materials`.

- [ ] **Step 1: Write the tests.**
  - JSON round-trip of `exampleStackup()` is deep-equal.
  - Wrong `schema` → error mentions "schema".
  - A missing `er` on a dielectric → error names the layer.
  - Hash round-trip of `defaultAppState()` is deep-equal.
  - `decodeHash('#s=garbage')` → `ok:false`.
  - `loadInitialState('#s=garbage', storageWithValidAutosave)` → source `storage`, with a notice.
  - A throwing storage (every call throws) → `storage.get` returns null and `loadInitialState('', throwing)` → source `example`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(io): JSON schema, URL-hash state, safe storage, initial-state loading`.

### Task 11: KiCad stackup import

**Files:**
- Create: `src/io/sexpr.ts`, `src/io/kicad.ts`, `tests/fixtures/kicad7-4layer.kicad_pcb`, `tests/fixtures/kicad8-6layer.kicad_pcb`, `tests/fixtures/kicad9-4layer-sublayers.kicad_pcb`
- Test: `tests/io/kicad.test.ts`

**Interfaces:**
- Produces:
  - `parseSexpr(text: string): SNode`, where `SNode = string | number | SNode[]`. It parses only from `(layers` and `(setup` onward; quoted strings are supported.
  - `importKicadStackup(text: string): { ok: true; stackup: Stackup; warnings: string[]; needsRoleReview: true } | { ok: false; error: string }`.

**Fixtures:** synthetic, hand-written minimal files with a `(kicad_pcb (version …) (layers …) (setup (stackup …)))` skeleton. Use KiCad 7/8 numbering (F.Cu 0, B.Cu 31) and KiCad 9 numbering (F.Cu 0, B.Cu 2, In1 4…). No real board files.

- [ ] **Step 1: Write the tests.**
  - The KiCad 7 4-layer fixture → copper names [F.Cu, In1.Cu, In2.Cu, B.Cu], thicknesses from `(thickness …)`, dielectric εr/tanδ from `epsilon_r`/`loss_tangent`, and maskTop t/εr from `F.Mask`.
  - Roles map `signal` → signal, `power` → plane, `mixed` → mixed.
  - KiCad 9: layers are matched by name regardless of number.
  - A dielectric with `addsublayer` → two consecutive DielectricLayers.
  - A dielectric without `epsilon_r` → `warnings` mention it, and the stackup is still produced with `er: NaN`, flagged by `validateStackup` as an error until fixed.
  - `importKicadStackup('not a board')` → `ok:false`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(io): KiCad .kicad_pcb stackup import (KiCad 6–9, synthetic fixtures)`.

### Task 12: Material presets (datasheet-verified) and CSV export

**Files:**
- Create: `src/model/materials.ts`, `src/io/csv.ts`
- Test: `tests/model/materials.test.ts`, `tests/io/csv.test.ts`

**Interfaces:**
- Produces:
  - `interface Material { id: string; name: string; family: string; type: 'core' | 'prepreg' | 'either'; er: number; tand: number; freq: string; source: string; preset: boolean }`;
  - `PRESETS: Material[]`;
  - `widthTableCsv(rows: { cls: ImpClass; layerName: string; main: SynthResult; compact: SynthResult }[], unit: Unit): string`.

- [ ] **Step 1: Fetch and read the datasheets.** Use the `tavily-search` skill to find them; ask the owner before converting PDFs, per the pdf-to-md rule. Datasheets: Isola 370HR, Isola IS400, Rogers RO4350B, Rogers RO4003C, Panasonic Megtron 6.
  - Record each εr/tanδ with the table name and frequency in `source`.
  - The Isola entries must match the spec values (core 7628 4.35 / 0.017, 1080 3.93 / 0.020, 2116 4.17 / 0.019 at 0.5–1 GHz). If the datasheet disagrees, stop and report to the owner.
  - Any value that cannot be verified is left out.
  - Generic FR4 = εr 4.3, tanδ 0.02, `source: 'Rough generic default, not from a datasheet'`.
- [ ] **Step 2: Write the tests.**
  - Every preset has a non-empty `source` and `freq`, εr in [2, 6], tanδ in (0, 0.05).
  - CSV header = `Class,Type,Target (Ω),Layer,W (<unit>),Gap (<unit>),Z (Ω),Deviation (%),Fab check,Compact W (<unit>),Compact gap (<unit>),Compact Z (Ω)`.
  - A failed cell writes its message in the `Fab check` column and blanks the numbers.
  - Values use the requested unit, with a dot as the decimal separator.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat: datasheet-sourced material presets and width-table CSV export`.

## Phase D — UI

Use the `frontend-design` / `ui-ux-pro-max` skills for visual decisions and `dataviz` for the sweep chart. Visual direction:
- the original page's look: IBM Plex Sans / Condensed / Mono, copper accent, light and dark tokens on `:root`;
- a phone-width layout without horizontal scroll.

### Task 13: App shell, store, stackup editor

**Files:**
- Create: `src/state/store.tsx` (reducer + context), `src/state/reducer.ts`, `src/ui/App.tsx`, `src/ui/StackupEditor.tsx`, `src/ui/LenInput.tsx`, `src/ui/MaterialPicker.tsx`, `src/ui/theme.css`
- Modify: `src/main.tsx`, `src/App.tsx` (remove the placeholder)
- Test: `tests/state/reducer.test.ts`, `tests/ui/LenInput.test.tsx`

**Interfaces:**
- Consumes: Tasks 3, 4, 10, 12.
- Produces:
  - `reducer(state: AppState, action: Action): { state: AppState; notice?: string }`;
  - actions: `setUnit`, `setStackup`, `addLayer(after: id, kind)`, `removeLayer(id)`, `moveLayer(id, dir)`, `updateLayer(id, patch)`, `setMask(side, patch)`, `setEtch(patch)`, `setCalc(patch)`, `selectLayer(id)`, `setRefs(above, below)`, `setClasses(c)`, `setTableLayers(ids)`, `resetExample`;
  - `<LenInput valueMm unit onChangeMm />`: shows `toDisplay` rounded for display, emits mm only when the user edits, and never re-emits on unit change;
  - autosave to `lotO.autosave` on every change (debounced 500 ms), and the URL hash is updated on change (`history.replaceState`).

- [ ] **Step 1: Write the tests.**
  - `removeLayer('cu5')` while cu5 is selected → selection moves to the nearest signal/mixed layer, refs reset to `defaultRefs`, and a notice is returned.
  - `updateLayer('cu4', {role:'signal'})` while cu4 is refAbove → refs are kept, and the cross-section warning shows "signal".
  - `setUnit` mm → mil → um → mm leaves every stored number bit-identical.
  - LenInput: switching unit doesn't call `onChangeMm`; typing "5.315" in mil calls it with 0.135001 (= 5.315·0.0254).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the reducer, store and stackup editor:
  - list rows: role select, thickness `LenInput`, material picker, εr, tanδ;
  - add / insert / remove / reorder; masks; etch settings with per-layer override;
  - name and unit selector; save / load named stackups; import / export JSON; share link (copies the URL); reset to example;
  - a material library dialog listing the presets (read-only, "duplicate") and user materials (add / edit / delete, persisted in `lotO.materials`). Picking a material fills εr/tanδ, which stay editable.
- [ ] **Step 4:** Run → PASS. Then `npm run dev` and check by hand that the example renders and edits persist across a reload.
- [ ] **Step 5:** Commit `feat(ui): app shell, state store, stackup editor`.

### Task 14: Calculator, results, field plot

**Files:**
- Create: `src/ui/Calculator.tsx`, `src/ui/Results.tsx`, `src/ui/FieldPlot.tsx`, `src/ui/fieldRender.ts`, `src/ui/usePool.ts`
- Test: `tests/ui/fieldRender.test.ts`, `tests/ui/Results.test.tsx`

**Interfaces:**
- Consumes: `SolverPool` (Task 9), `CalcState`, `AnalyzeResult`, `SynthResult`, `derived.ts`.
- Produces:
  - `usePool(): SolverPool`, a singleton disposed on unmount;
  - `sampleField(f: FieldData, x: number, y: number, odd: boolean): number` (bilinear; mirrors x < 0, negated in odd mode);
  - `renderField(ctx, result, view)`: slabs, planes labelled with layer names, trapezoid slices, coplanar GND, contour every 0.1, a sequential ramp (SE/even) or a diverging ramp (odd), ported from the original page's `drawField`.

- [ ] **Step 1: Write the tests.**
  - `sampleField` at a grid node returns that node's V; at x = −a in odd mode it returns −V(a).
  - Results component:
    - with L1 and L2 null → no "Delay"/"Skew" rows;
    - with L1 = 100 → Delay is shown;
    - a diff result with `oddOnly` → Zeven/Zcm are hidden and the explanation text is present;
    - the deviation chip is green within tol, amber within 2·tol, red beyond (as in the original).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement the calculator controls** per spec §6.7:
  - layer and refs selects ("none" allowed; signal-role refs show a warning);
  - SE/diff, CPW + G, rect/trapezoid toggle, W, S, target, fmin, tol, compact, mesh;
  - Find W / Find gap / Round, with the original's button visibility rules;
  - debounced analysis at 180 ms, superseding (cancelling) the stale job.
- [ ] **Step 4: Implement the results panel:**
  - big Z and chip; key-value grid (SE: εeff, delay ps/mm, C pF/m, L nH/mm; diff: Zodd, Zeven, Zcm, εeff odd, delay, coupling);
  - loss in dB/m and dB/in at f;
  - delay/skew;
  - topology label, geometry line, notes and warnings, fab-minimum chips;
  - the field plot.
- [ ] **Step 5:** Run → PASS. Check by hand in `npm run dev`: the default state shows 50.0 Ω on In5.Cu; F.Cu 0.20 shows ≈ 50.3.
- [ ] **Step 6:** Commit `feat(ui): calculator, results and generalised field plot`.

### Task 15: Sweep chart and width table

**Files:**
- Create: `src/ui/Sweep.tsx`, `src/ui/SweepChart.tsx`, `src/ui/WidthTable.tsx`
- Test: `tests/ui/WidthTable.test.tsx`

**Interfaces:**
- Consumes: `SolverPool.runBatch`, `tableCell`, `widthTableCsv`, `ImpClass`.
- Produces: the panels. The sweep chart is a hand-rolled SVG: Z line, target line, ±tol band, fab-minimum vertical line, hover readout, both themes.

- [ ] **Step 1: Write the tests** (pool mocked).
  - The CSV button is absent before running and present after the batch resolves.
  - Removing a class or changing a layer clears the results and hides CSV again.
  - Cancel during a batch calls `cancel()` and leaves the table empty.
  - The three pre-loaded classes are listed with rule "Compact at target".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
  - Sweep: param W or gap, from / to / N (default 15), progress, cancel.
  - Width table:
    - class editor (name, type, target, rule with gap or pitch value, optional G);
    - layer picker (signal/mixed by default, refs overridable per layer);
    - the results grid with the main column and the "Most compact within ±tol" column;
    - Download CSV (Blob, `lordoftheohms-widths.csv`).
- [ ] **Step 4:** Run → PASS. Check by hand: run the table on the example and compare cu5 DIFF 100 with Task 8's values.
- [ ] **Step 5:** Commit `feat(ui): Z sweep chart and width table with CSV export`.

### Task 16: KiCad import flow, role review, assumptions and validation section

**Files:**
- Create: `src/ui/ImportDialog.tsx`, `src/ui/RoleReview.tsx`, `src/ui/Assumptions.tsx`
- Test: `tests/ui/RoleReview.test.tsx`

**Interfaces:**
- Consumes: `importKicadStackup`, `parseStackupJson`, `src/validation.json`.
- Produces:
  - the import dialog (file input, reads the file in the browser via `File.text()`);
  - the role-review step listing every copper layer with its imported role, editable, with a hint that KiCad often leaves plane layers typed as signal;
  - the "Assumptions & validation" section: the generic notes listed in spec §6.7 (English) and the table rendered from `validation.json`.

- [ ] **Step 1: Write the tests.**
  - After a fixture import, the stackup is not applied until "Use this stackup" is clicked.
  - Changing In1.Cu from signal to plane in the review applies the change.
  - A JSON import error shows the error list.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Search for forbidden strings with the local, untracked pattern list: `grep -riE -f reference/forbidden.txt dist src docs tests scripts` → no matches.
- [ ] **Step 6:** Commit `feat(ui): KiCad import with role review, assumptions and validation section`.

## Phase E — Ship

### Task 17: README, deploy, verify

**Files:**
- Modify: `README.md`
- Test: none (deployment verification)

- [ ] **Step 1: Update the README.**
  - Mark features as available.
  - Use the commands `npm install`, `npm run dev`, `npm test`, `npm run test:validation`, `npm run build`.
  - Link `docs/validation.md`.
  - State the 0.7·T provenance, or its placeholder label.
- [ ] **Step 2:** Run `npm ci && npm test && VALIDATION=1 npm run test:validation && npm run build` → all PASS.
- [ ] **Step 3: Remove the ignored build step.** Write `{"commandForIgnoringBuildStep": null}` to a scratch JSON file. Run `npx --yes vercel@latest api "/v9/projects/<projectId>?teamId=<teamId>" --method PATCH --input <file>`, with the project and team ids from `reference/HANDOFF.md`. The response must show `"commandForIgnoringBuildStep":null`.
- [ ] **Step 4: Push.** Run `git remote -v`, then `git push origin main`.
- [ ] **Step 5: Verify the deployment.**
  - Wait for the production deployment (Vercel MCP `list_deployments` / `get_deployment`, or `npx vercel@latest ls lordoftheohms`). State must be READY. On ERROR, read the build logs and fix.
  - Note the assigned `*.vercel.app` domain.
- [ ] **Step 6: Check the live site** (Playwright). Open the production URL and wait for the result; the In5.Cu default must show "50.0" Ω. Open a share link generated locally and confirm it restores the same state.
- [ ] **Step 7: Publish the URL.** Add it to the README, commit `docs: live URL`, push. Run `gh repo edit RaffaeleBiondi/Impedance_calculator --homepage <url>`.
- [ ] **Step 8:** Report to the owner, in Italian: the URL, the validation summary, the V1 shifts compared with the original page, and anything recorded as a deviation.
