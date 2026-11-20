# LordOfTheOhms — design

Date: 2026-11-20 · Repo: `RaffaeleBiondi/Impedance_calculator` (public) · Status: approved by the owner on 2026-11-20

## 1. Intent

A free, public, browser-only PCB transmission-line impedance calculator built on a real 2D quasi-static field solver, for any stackup.

It starts from a single-board calculator: an earlier web page made for one 10-layer board. That page has a validated solver, but its stackup, layer roles and tables are hard-coded. LordOfTheOhms keeps the solver and its accuracy, and makes everything else editable: layers, materials, references, geometries and etch profile.

It is for PCB designers who want field-solver numbers rather than closed-form approximations, with the assumptions and the validation shown. It must stay honest. Every geometry it offers is checked against a closed form or a published reference, and the check is recorded.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**

- **Stackup editor:**
  - any number of copper layers (2 to 20+), each with a name, role (signal / plane / mixed) and copper thickness;
  - each dielectric with material name, type (core / prepreg), thickness, εr and tanδ;
  - consecutive dielectrics (sub-layers) allowed;
  - top and bottom solder mask, each with a thickness and εr.
- **Reference selection:** for the selected signal layer, the user picks the reference above and below, or *none* on either side. Skipping layers is allowed (for example, referencing two layers away under a split plane).
- **Geometries:**
  - microstrip, embedded microstrip, symmetric and asymmetric stripline;
  - CPW with and without a ground plane;
  - edge-coupled differential pairs, with and without coplanar GND.
- **Etch profile:** a toggle between rectangular (the **default**) and trapezoidal. The trapezoid is set by a coefficient proportional to each layer's copper thickness (§6.1).
- **Results:**
  - single-ended: Z0, εeff, delay, C, L;
  - pairs: Zdiff, Zodd, Zeven, Zcm, εeff (odd), delay, coupling;
  - the potential field plot;
  - dielectric loss at a user frequency;
  - delay and skew, only when the user enters lengths. Both are optional; nothing is computed or shown without them.
- **Synthesis, as in the original page:** find W for a target; find the gap with W fixed; the most compact geometry within ±tol % respecting a fab minimum; round to grid.
- **Sweep:** a chart of Z vs W or Z vs gap.
- **Width table:** impedance classes × signal layers, giving W and gap per layer. CSV export of this table only, available only once the table has results.
- **Material library:** editable presets plus user materials.
- **Stackup persistence:**
  - save and load as JSON;
  - share the state in the URL hash;
  - autosave in localStorage, plus named saved stackups;
  - **import of the stackup section of a KiCad `.kicad_pcb`**, done in the browser.
- **Units:** mm, mil or µm.
- **Built-in example:** one generic stackup reproducing the original page's defaults (§6.8).
- **UI language:** English only.

**Non-goals (v1)**

- Conductor loss, surface roughness, and frequency-dependent εr/tanδ (Djordjevic-Sarkar). The solver is quasi-static, so εr and tanδ are constant.
- Broadside-coupled pairs, more than two signal conductors, via or return-path modelling, 3D.
- Skew between lines on different layers or with different geometries.
- Database, accounts, server-side storage, short links. **No backend.**
- PDF export, CSV export of anything except the width table, i18n.

**Anti-goals: failure even if it "works"**

- Numbers that look precise but were never checked. Every geometry has a recorded validation, and the UI states the modelling assumptions.
- Losing solver accuracy during the port. Golden tests against the original JS guard it.
- Company- or board-specific content in the public repo or site: company names, the original board's netclass tables, its file paths, its dated notes, the original page's HTML, or real board files used as test fixtures.
- Personal data in committed files: names, emails, local paths, account usernames. Commits use the owner's GitHub noreply address, which is already set in the repo-local git config.
- A UI that freezes while computing. All solving runs in Web Workers and can be cancelled.

## 3. Constraints

- **Static site, no backend:** Vite build output, deployed on Vercel. The site is public; Deployment Protection is off by the owner's choice.
- **Vercel project** `lordoftheohms`, already created:
  - linked to the GitHub repo; Git deployments are enabled, `main` deploys to production and PRs get previews;
  - Deployment Protection is off;
  - framework preset Vite, `npm ci` / `npm run build` / `dist`;
  - project Node version 26.x;
  - the ignored-build-step command `test ! -f package.json` skips builds until the app exists. Remove it once `package.json` lands.
- **Tooling:** npm only, with no pnpm and no global installs. The Vercel CLI runs through `npx`.
- **Commits:**
  - messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - verify `git remote -v` before any push.
- **Porting the UI behaviour:**
  - the original page and the scripts behind its validations are available to the builder locally and are never committed;
  - synthesis messages, the Round button, compact-mode explanations and the field plot are ported from that page and translated to English;
  - board-specific content stays out (see §6.7).
- **EE numbers must be verifiable:**
  - material presets cite the datasheet, table and frequency for every εr/tanδ value;
  - those values are fetched from the datasheets during implementation, never written from memory;
  - anything uncertain is labelled as such in the UI.
- **Name:** "LordOfTheOhms" is used as a pun only, with no Tolkien imagery, fonts or quotes.

## 4. Approaches considered

| Area | Picked | Rejected, and why |
|---|---|---|
| Solver | **Extend the existing finite-volume solver** (graded rectilinear grid, PCG + IC(0), energy → C, Richardson between two meshes). It is validated to ~0.1 % against exact formulas on unmasked lines. Masked lines get the grid fix in §6.3. | **BEM / method of moments rewrite:** handles trapezoids and open domains natively, but discards a validated solver and every reference value. **FEM on triangles:** heavy, same objection. |
| Trapezoid | **Stack of thin rectangular slices, fixed count** (default 8). Grid lines sit on every slice edge, so the discretised geometry does not change with mesh density and Richardson stays meaningful. The slice error is measured separately (8 vs 16 slices). | **Staircase drawn by the grid itself:** the shape changes with q, which corrupts the Richardson extrapolation. The legacy mask edge suffers from exactly this (§6.3). |
| Frontend | **React + TypeScript + Vite**, solver in a **pool of Web Workers**. | **Vanilla TS like the original page:** an N-layer editor, material library, saved stackups and batch tables become hard to maintain without components. **Svelte/Preact:** fine technically, but less common for a future maintainer. |
| Persistence | **Browser only:** localStorage, JSON files, URL hash. | **Database:** only needed for shared team libraries, accounts or short links, and on a public site it would also need auth and abuse protection. Can be added later without touching the calculator. |

The owner decided the "what": features, defaults, language, account, policies. The "how" (stack, solver approach, trapezoid method) was handed to Claude and is recorded above as Claude's calls.

## 5. Decisions made by the owner

**Scope**
- Trapezoid and CPW without ground are in **v1**.
- Extra results: **dielectric loss**, and **delay and skew only when lengths are entered**.
- Batch tools: **Z vs W / gap chart**, **width table per stackup**, **KiCad stackup import**.
- Export: **CSV of the width table only**, shown only after the table has been computed.
- Width table pre-loaded classes: **50 Ω single-ended, 100 Ω differential, 90 Ω differential**.
- Width table default rule: **at target, most compact** (W at the fab minimum with the gap solved, or the reverse), plus an **extra "most compact within ±tol" column** as in the original page.

**Modelling**
- Etch profile is a **toggle, rectangular by default**.
- Trapezoid reduction **proportional to copper thickness**: one coefficient per stackup, default **W − W_top = 0.7·T** of each layer, overridable per layer, labelled "rule of thumb — ask your fab".
- Solder mask: a **single conformal thickness** and εr.
- **Fix the legacy solder-mask grid defect** (§6.3), even though masked outer-layer values shift by about −0.1 % compared with the original page.

**Policies**
- **Failed validation:** investigate first, using a second reference and the convergence check, because the closed form is often the inaccurate side. If the solver holds, the geometry ships with the measured deviation shown on the page and in `docs/validation.md`.

**Project**
- **English only.** **No database.** **MIT license.**
- **Public** Vercel deployment; project name from **LordOfTheOhms**.
- Commits use the **GitHub noreply** address.

## 6. Design

### 6.1 Data model

All lengths are stored in **mm** in the model and in the JSON. Units are a display concern only.

```ts
type Role = 'signal' | 'plane' | 'mixed';
interface EtchRule      { by: 'fraction' | 'factor'; value: number }  // fraction: W - W_top = value·T ; factor: EF = T / undercut-per-side
interface CopperLayer   { kind: 'copper'; id: string; name: string; role: Role; t: number;            // mm
                          base?: 'auto' | 'above' | 'below';                                         // which dielectric the trace is etched on
                          etchOverride?: EtchRule }                                                  // per-layer override of the stackup rule
interface DielectricLayer { kind: 'dielectric'; id: string; material: string; type: 'core' | 'prepreg';
                          t: number; er: number; tand: number; materialId?: string }
interface Mask          { t: number; er: number; tand: number }                                      // t = 0 means no mask
interface Stackup {
  schema: 'lordoftheohms/stackup@1';
  name: string;
  layers: (CopperLayer | DielectricLayer)[];   // top to bottom; starts and ends with copper; >= 1 dielectric between coppers
  maskTop: Mask; maskBottom: Mask;
  etch: { mode: 'rect' | 'trap'; rule: EtchRule };   // default { mode: 'rect', rule: { by: 'fraction', value: 0.7 } }
}
```

**Thickness convention.** As in the original page and in KiCad, a dielectric thickness is measured between copper faces. Copper thickness adds to the plane-to-plane distance. Example from the original page: 0.20 core + 0.018 Cu + 0.14 prepreg = 0.358 mm.

**Etch profile**
- The drawn width W is the **base** width, the side etched on the laminate. Gap S and coplanar gap G are measured at the base.
- The reduction uses the **layer's own T**:
  - by fraction: W_top = W − value·T;
  - by etch factor: W_top = W − 2·T/EF.
- With the default 0.7 that gives about 25 µm on 35 µm copper and 13 µm on 18 µm copper.
- **Provenance of 0.7:** it comes from recall of the "1 mil per oz" convention in fab calculators, not from a cited source. During implementation, find a citable source (a fab's published etch data or a field-solver vendor's default). Until then, label it in the UI as "placeholder rule of thumb — use your fab's value".
- **Coplanar GND edges get the same profile as the trace**, since they come from the same etch.
- Reject a profile where W_top ≤ 0.

**Calculator state** (also in the URL hash):
- signal layer id, and the reference above and below (layer id or `null`);
- line type (SE / diff), coplanar GND on/off;
- W, S, G, target, fab minimum, tolerance, compact mode;
- mesh (normal q = 1 / fine q = 2), etch toggle;
- frequency for loss, optional lengths L1/L2, unit.

### 6.2 From stackup + selection to a cross-section

One builder handles every topology. The topology label is derived from the result, not chosen by the user:
- outer layer with a reference below: microstrip;
- inner layer with only one reference: embedded microstrip;
- two references at equal distance and εr: symmetric stripline, otherwise asymmetric;
- coplanar GND adds "CPW" / "CPWG".

**Rules**

1. **References:**
   - the default is the nearest `plane` or `mixed` layer above and below;
   - any copper layer on the correct side may be chosen, or `none`;
   - choosing a layer whose role is `signal` is allowed, with a visible warning. Imported role types are often wrong (§6.5), so refusing it would block legitimate set-ups.
2. **Orientation:** the solver's y axis points away from the **base** dielectric.
   - Choosing the base:
     - if exactly one neighbouring dielectric is a core, it is the base (the legacy rule);
     - outer layers use the board side;
     - if both neighbours are cores or both are prepregs, the lower one in stackup order is the base, overridable per layer with `base`.
   - The trace's wide side sits on the base. The narrow side (trapezoid top) faces the cover.
3. **Trace layer fill:**
   - inner layers: the first dielectric on the cover side, because the prepreg flows around the trace (legacy `erf`);
   - outer layers: conformal mask, then air.
4. **Slabs:** walk from the trace toward each reference, emitting one slab per dielectric layer.
   - A **skipped copper layer** becomes a slab of its copper thickness, filled with the εr/tanδ of its adjacent prepreg. If there is none, the adjacent dielectric nearer the trace is used. The model assumes the skipped layer is cut out under the whole cross-section, and the UI says so.
   - With **no reference** on a side, the slabs continue to the board surface, then that side's mask (if t > 0), then air to an open boundary.
5. **Coplanar GND:** copper of the same thickness and etch profile, at gap G from the trace edge (both measured at the base), extending to the domain edge. It is conformally masked on outer layers.
6. **Invalid set-ups are rejected** with a message:
   - with no reference at all (no plane on either side and no coplanar GND), a single-ended line is refused; a pair shows **odd mode / Zdiff only**, with Zeven/Zcm hidden and an explanation;
   - W, S, G or any thickness ≤ 0, or W_top ≤ 0;
   - a reference on the wrong side.

### 6.3 Solver

**Step 1: port verbatim.**
- Port `reference/artifact/zsolver.js` to TypeScript unchanged:
  - axis grading, IC(0)-PCG, energy capacitance;
  - `rich()` with exponent 1.5 for T > 0 and 1 for T = 0;
  - `rootLog` regula falsi in log space;
  - the `compact` corner logic.
- Copy the original JS into the repo as `tests/legacy/zsolver.legacy.js`; it contains no board content.
- V0 checks the port against it to ≤ 1e-9 relative.

**Step 2: generalise.** A general problem description replaces the two hard-coded types:

```ts
interface Problem {
  slabs: { y0: number; y1: number; er: number; tand: number }[];   // full-width dielectric bands
  extraDiel: { x0; x1; y0; y1; er; tand }[];                       // conformal mask pieces
  conductors: { x0; x1; y0; y1; v: 0 | 1 }[];                      // trace slices, coplanar GND slices
  bottom: 'ground' | 'open'; top: 'ground' | 'open';
  leftBC: 'neumann' | 'dirichlet';                                 // even/SE vs odd-mode symmetry wall
  keysX; keysY; fineX; fineY; hmin; hmax; hmaxY; growth; xmax; ymax;
}
```

- **Every material and conductor edge sits on a grid line.** Legacy `buildProblem` puts no grid line on the solder-mask side walls (x = xa − tm, xb + tm, xg − tm), so the mask edge is a staircase that moves with q and spoils the Richardson step.
  - Measured on the legacy code, Richardson for meshes (1,2) / (2,4) / (4,8) on F.Cu SE W 0.20 (the example stackup) gives 50.222 / 50.360 / 50.291 Ω. With the mask wall on a grid line it gives 50.316 / 50.311 / 50.312 Ω.
  - The generalised builder therefore adds x keys (and fine points) on all mask walls, all trapezoid slice edges and all coplanar GND edges.
- **Legacy equivalence (V2):** for **unmasked** legacy topologies, the generalised builder must emit the same grid and give results within ≤ 1e-9 relative of the legacy solver. That covers stripline with three slabs, and microstrip with mask thickness 0. Masked cases are re-baselined (V1).
- **Open sides:** extend the domain with air and hold the far boundary at 0 V, exactly like the legacy microstrip top (`dom` × max(30·H, 6·W)). The bottom boundary is no longer unconditionally grounded (`solveCap` currently forces `j === 0` to 0 V). For CPW without ground, the domain-size sensitivity (dom 1 vs 2) is part of the validation.
- **Trapezoid:**
  - N slices (default 8) of height T/N, each a rectangle whose half-width is the trapezoid's at the slice mid-height, so area is preserved;
  - y keys at every slice boundary, x keys at every slice edge;
  - with W_top = W the slices collapse to the single rectangle, giving identical results;
  - the conformal mask follows the slices, each expanded by the mask thickness, with keyed walls.
- **Richardson for new cases:** measure the observed convergence order on three meshes (q, 2q, 4q) for trapezoid and open-boundary cases. If it differs materially from 1.5, use the measured order for those cases and record it.
- **Dielectric loss:**
  - split the field energy by cell material: each edge term splits into its two adjacent-cell contributions;
  - tanδ_eff = Σ W_cell·tanδ_cell / W_total, where the total includes air at tanδ 0;
  - α_d = π·f·√εeff·tanδ_eff / c in Np/m, × 8.686 for dB/m;
  - pairs report the odd mode for the differential loss;
  - this follows from G = ω·Σ C_i·tanδ_i and C·Z0 = √εeff / c.
- **Performance budget** (Node, original JS): SE normal ≈ 35 ms, SE fine ≈ 130–180 ms, pair fine ≈ 0.5 s.
  - Keyed mask walls add a few grid lines, so expect a small increase.
  - `scripts/bench.ts` prints these numbers. The port must not be materially slower.

### 6.4 Synthesis and batch work

- **Ported from the original page:** `findW`, `findS`, `compact`, and their messages ("target out of reach: Z goes from … to …", the four compact-mode explanations), translated to English.
  - **Round** rounds W and S to the *nearest* grid step (0.005 mm in the original; the step per unit is left to the builder).
  - `compact` rounds *up*, as in the legacy code.
  - The fab minimum applies to W and gap, and to G as a warning when CPW is on.
- **Worker pool:**
  - size = clamp(`hardwareConcurrency` − 1, 1, 8);
  - one message protocol: `analyze`, `findW`, `findS`, `compact`, `sweepPoint`;
  - cancellable: terminate the worker and respawn it;
  - progress reported for batch jobs.
- **Sweep:**
  - parameter W or gap, from/to/N points (default 15), using the current layer and settings;
  - the chart shows Z with the target line, the ±tol band and the fab-minimum line;
  - points are computed in parallel.
- **Width table:**
  - **Classes:** the user edits `{ name, type: 'se' | 'diff', target, gapRule: 'compact at target' | 'fixed gap' | 'fixed pitch', gap or pitch value, coplanar G (optional) }`. Pre-loaded classes (removable): "SE 50", "DIFF 100", "DIFF 90".
  - **Default rule `compact at target`** (owner's choice) hits the target exactly with the smallest footprint and needs no extra number:
    - **SE:** findW for the target.
    - **DIFF:** W = fab minimum, then findS for the target. If that gap would fall below the fab minimum, set the gap to the minimum and run findW instead.
    - If no geometry reaches the target within the fab limits, the cell says so, with the reachable Z range.
  - **Layers:** the user picks the signal/mixed layers to include, each with its default references, overridable.
  - **Main column per cell:** one synthesis job using the class rule (compact at target, findW at a fixed gap, or findW at a fixed pitch with S = pitch − W). Output: W, gap, Z achieved, deviation, fab-minimum flag.
  - **Extra column "most compact within ±tol"** (owner's choice), as in the original page: the legacy `compact` result (narrowest W, or smallest 2W + S, inside target·(1 ± tol)), with its Z and the footprint saved compared with the main column. Z sits on the tolerance edge by construction, and the column says so.
  - **CSV export:** one row per class × layer, both columns, units in the header. It appears **only after the table has results**.
- **Delay and skew:**
  - if L1 is entered, show delay = tpd·L1;
  - if L2 is also entered, show skew = tpd·|L1 − L2|, meaning two nets routed with this same geometry;
  - pairs use the odd-mode tpd;
  - with no lengths, nothing is shown.

### 6.5 Persistence, sharing, import

- **Load order:** URL hash `#s=…` → localStorage autosave → built-in example.
- **URL hash:** compressed JSON (stackup + calculator state) in the fragment, not the query string, so it never reaches server logs.
- **localStorage:** autosave, named saved stackups, user materials. Every read and write sits in try/catch, and the app works without storage.
- **JSON import/export:** the `Stackup` schema above, versioned by `schema` and validated on import, with clear errors.
- **KiCad import:**
  - parse only the `(layers …)` and `(setup (stackup …))` sections of a `.kicad_pcb`, with a small tolerant S-expression reader;
  - copper names come from the stackup; roles come from the `layers` types (`signal` → signal, `power` → plane, `mixed` → mixed, `jumper` → signal);
  - **role review after import:** KiCad layer types are frequently left at the default, so a GND plane is often typed `signal` and a power plane `mixed`. After an import, the app shows the imported roles in a review step and asks the user to confirm or fix them before the stackup is used;
  - read thicknesses, materials, `epsilon_r`, `loss_tangent`, and `F.Mask`/`B.Mask` thickness and εr;
  - dielectric sub-layers stay separate layers;
  - match layers by name, not number (numbering changed in KiCad 9); support KiCad 6–9 files;
  - report missing εr/tanδ, never default them silently;
  - the file never leaves the browser;
  - test fixtures are synthetic files written for the tests.

### 6.6 Material library

- **Presets** are read-only and can be duplicated; **user materials** are editable and persisted.
- **Fields:** name, family, type (core / prepreg / either), εr, tanδ, the frequency of the values, source note.
- **Presets for v1:**
  - generic FR4, labelled as a rough default;
  - Isola 370HR / IS400 entries matching the original page: core 0.2 mm 1×7628 εr 4.35 / tanδ 0.017, prepreg 1080 3.93 / 0.020, prepreg 2116 4.17 / 0.019, from the Dk/Df tables at 0.5–1 GHz;
  - Rogers RO4350B and RO4003C;
  - Panasonic Megtron 6.
- **Every preset value is re-checked against the datasheet table at implementation time,** with the table and frequency recorded in the source note. A value that cannot be verified does not ship.

### 6.7 UI (English)

**Left column: stackup editor**
- name and unit selector;
- layer list: add, insert, remove, reorder;
- per layer: role, thickness, material picker (fills εr/tanδ, still editable), εr, tanδ;
- masks; etch settings (mode, rule, per-layer overrides);
- save, load, import JSON / KiCad, export JSON, share link, reset to example.

**Right column: calculator**
- signal layer, references above/below (with "none"), SE / diff, coplanar GND + G, the rect / trapezoid toggle;
- W, S, target, fab minimum, tolerance, compact mode, mesh;
- buttons: Find W / Find gap / Round;
- **Result:**
  - the big Z, a deviation chip and a key-value grid;
  - dielectric loss at f, and delay/skew when lengths are entered;
  - the topology label, plus a geometry line describing the slabs;
  - assumption notes, for example "skipped In3.Cu: assumed cut out under the trace";
  - the field plot.

**Below the calculator**
- the **Sweep** and **Width table** panels;
- an **Assumptions & validation** section with the validation table produced by the tests (§7) and these generic notes, ported from the original page:
  - the thickness convention;
  - the solver method (finite volumes, energy-based C, symmetry walls, Richardson);
  - the compact-geometry explanation: the optimum sits on a corner, and at the tolerance edge no margin is left for fab variation;
  - quasi-static and solid-plane assumptions;
  - the trapezoid rule of thumb;
  - the mask caveat.

Board-specific notes from the original page do not ship: the fab name, that board's laminate choice and sensitivity numbers, its power-plane remark, the KiCad file mismatch, and the dated tables.

**Look and layout**
- light and dark theme;
- works at phone width, but desktop is the primary target;
- the field plot is generalised to N slabs, trapezoids, coplanar grounds and open sides, with planes labelled by layer name.

### 6.8 Built-in example stackup

"Example 10-layer (high-Tg FR4)", with generic names and roles.

**Copper layers**
- `F.Cu`, `In1.Cu` … `In8.Cu`, `B.Cu`;
- roles: signal on F, In2, In5, In7, B; plane on In1, In3, In4, In6, In8;
- outer copper 35 µm, inner 18 µm.

**Dielectrics, top to bottom**

| # | Type | Material | Thickness (mm) | εr | tanδ |
|---|---|---|---|---|---|
| 1 | prepreg | 2116 | 0.12 | 4.17 | 0.019 |
| 2 | core | 7628 | 0.20 | 4.35 | 0.017 |
| 3 | prepreg | 2×1080 | 0.14 | 3.93 | 0.020 |
| 4 | core | 7628 | 0.20 | 4.35 | 0.017 |
| 5 | prepreg | 2×1080 | 0.14 | 3.93 | 0.020 |
| 6 | core | 7628 | 0.20 | 4.35 | 0.017 |
| 7 | prepreg | 2×1080 | 0.14 | 3.93 | 0.020 |
| 8 | core | 7628 | 0.20 | 4.35 | 0.017 |
| 9 | prepreg | 2116 | 0.12 | 4.17 | 0.019 |

**Mask:** 10 µm, εr 3.3, on both sides.

**Etch:** rect (rule: fraction 0.7).

**Default calculator state:** In5.Cu, SE, W 0.135, target 50 Ω, fab minimum 0.125, mesh fine.

## 7. Validation and tests (Vitest)

Every geometry is checked against a closed form or a published reference. A script writes the results to `docs/validation.md`, and the same table appears in the app.

**When a check fails:** investigate with a second reference and the convergence check. If the solver holds, record the deviation and show it on the page; do not hide or drop it silently (§5).

| # | Test | Reference | Acceptance |
|---|---|---|---|
| V0 | **Port golden:** problem descriptors built by the *legacy* `buildProblem` are fed into the TS core (grid, solve, Richardson, synthesis) and compared with the legacy JS end to end, on a spread of cases (SE/diff, micro/strip, with/without CPW G, with/without mask, T = 0 and T > 0, q = 1, 2). The test stays valid after the builder is generalised, because it bypasses the new builder | `tests/legacy/zsolver.legacy.js` | ≤ 1e-9 relative |
| V1 | **Regression**, example stackup, improved builder, q = 2 | see below | see below |
| V2 | **Legacy equivalence:** generalised builder vs legacy `buildProblem` on unmasked topologies | legacy | identical grid; ≤ 1e-9 relative (§6.3) |
| V3 | **Coupled stripline vs Cohn:** T = 0, b = 0.4, εr 4, W 0.15 / S 0.25, `DIFF(g, 4)` | Cohn: zr(k) = 30π/√εr·K(k′)/K(k); Zoe = zr(a·tanh c), Zoo = zr(a/tanh c); a = tanh(πW/2b), c = π(W+S)/2b | reproduces −0.05 % / −0.06 %; ≤ 0.1 % |
| V4 | **Single stripline vs Cohn:** T = 0, W 0.1 / 0.2 / 0.4, b = 0.4, q = 2. The reviewer measured −0.009 to −0.023 % | zr(tanh(πW/2b)) | ≤ 0.15 % |
| V5 | **Microstrip vs Hammerstad-Jensen:** T = 0, no mask, H 0.12, εr 3.9, u = 0.5 / 1 / 2, q = 4, dom 1 and 2 | HJ (Appendix A) | reproduces −0.07…−0.02 %; ≤ 0.2 %. HJ's own εeff accuracy is ~0.2 %, so this shows agreement within the reference's accuracy, not 0.05 % solver accuracy |
| V6 | **Coupled microstrip:** T = 0, no mask | Kirschning-Jansen coupled microstrip | within KJ's stated accuracy (record it) |
| V7 | **Mesh convergence:** rich(1,2) vs rich(2,4) on the six legacy cases (Appendix B) plus every new topology, including masked, trapezoid and open cases | self | ≤ 0.3 %; masked cases are expected to drop from 0.265 % to ~0.01 % with keyed mask walls |
| V8 | **Homogeneous checks:** any topology with a single εr everywhere gives εeff = εr | exact | ≤ 1e-4 relative |
| V9 | **Asymmetric stripline:** T = 0, homogeneous | symmetric Cohn limit when H1 = H2, plus a published offset-stripline formula (e.g. Wadell) | exact limit ≤ 0.15 %; formula within its stated accuracy |
| V10 | **Embedded microstrip** | limits (cover → 0 equals microstrip); published approximation (Wadell / IPC-2141A) | limit ≤ 0.1 %; approximation within its stated accuracy |
| V11 | **CPW without ground:** T = 0, thick substrate (h ≫ W+2G) | exact conformal map: εeff = (εr+1)/2, Z0 = 30π/√εeff·K′(k0)/K(k0), k0 = W/(W+2G) | ≤ 0.3 %; dom 1 vs 2 recorded |
| V12 | **CPW on a finite substrate; CPWG** | Ghione / Veyres–Fouad Hanna partial-capacitance formulas (Wadell, Simons) | within the formulas' stated accuracy (~1 %), recorded |
| V13 | **Trapezoid** | limits and convergence | W_top = W equals the rectangle (≤ 1e-9); Z between rect(W_top) and rect(W); 8 vs 16 slices ≤ 0.1 %; observed mesh order recorded |
| V14 | **Dielectric loss** | exact homogeneous stripline α_d = π f √εr tanδ / c; self-consistency identity tanδ_eff = (εr/εeff)·∂εeff/∂εr·tanδ for single-dielectric microstrip | ≤ 0.1 % / ≤ 0.5 % |
| V15 | **Solder mask** | none exists: sensitivity only (mask t = 0 gives exactly the no-mask result; Z monotonic in t and εr; converged per V7) | recorded, labelled "not validated against a reference" |
| V16 | **Model and IO:** stackup validation, reference defaults, orientation and base rules, skipped-layer slabs, proportional etch per layer, units round-trip, JSON schema round-trip, URL hash round-trip, KiCad import on synthetic KiCad 7/8/9 fixtures, CSV formatting | — | unit tests |

**V1 regression values**

| Case | Original page (legacy grid) | New assertion |
|---|---|---|
| In5 SE 0.135 | 50.03 | 50.03 ± 0.02 Ω (unmasked, must not change) |
| In5 diff 0.125/0.315 | 100.79 | 100.79 ± 0.02 Ω (unmasked, must not change) |
| F.Cu SE 0.20 | 50.36 | ≈ 50.31 Ω |
| F.Cu diff 0.17/0.27 | 100.78 | computed with the improved builder |
| F.Cu diff 0.21/0.25 | 90.18 | computed with the improved builder |

For the three masked F.Cu cases:
- the values are produced at implementation;
- each must be converged: rich(2,4) vs rich(4,8) ≤ 0.02 %;
- each is committed as the new golden value, with the original page's value and the shift recorded next to it in `docs/validation.md`;
- never assert the rounded 1-decimal digit, because some values sit 0.01–0.02 Ω from a rounding edge.

**Run time:** the full suite should run in well under 2 minutes locally. Slow validations may be tagged and run in CI only.

## 8. Repo layout, tooling, deploy

```
src/solver/      grid.ts, fv.ts (solveCap), problem.ts, analyze.ts, richardson.ts, synth.ts, loss.ts, worker.ts, pool.ts
src/model/       stackup.ts (types, validation), crossSection.ts (§6.2), materials.ts (presets), example.ts, units.ts
src/io/          json.ts, urlState.ts, storage.ts, kicad.ts, csv.ts
src/ui/          React components (StackupEditor, MaterialLibrary, Calculator, Results, FieldPlot, Sweep, WidthTable, Validation)
tests/           *.test.ts, tests/legacy/zsolver.legacy.js, tests/fixtures/*.kicad_pcb (synthetic)
scripts/         bench.ts, validation-report.ts (writes docs/validation.md)
docs/            validation.md, superpowers/specs/…
vercel.json      { framework: "vite", buildCommand: "npm run build", outputDirectory: "dist" }
```

**Already in the repo** (commit `4440db5`): README (status "work in progress"), MIT LICENSE, `.gitignore`, `.gitattributes`, `.editorconfig`, GitHub issue templates. Update the README as features land.

**CI:** a GitHub Actions workflow runs `npm ci && npm test && npm run build` on push and PR. Vercel builds on its own.

**Deploy sequence:**
1. Push the first working version to `main`.
2. Remove the ignored-build-step command from the Vercel project.
3. Check that the production deployment succeeds, find the assigned `*.vercel.app` domain, and confirm it loads and computes the regression case.
4. Add the URL to the README and to the repo homepage.

## 9. Left to the builder

- Chart implementation (hand-rolled SVG vs a small library), styling, component breakdown, and state management (`useReducer` / a small store).
- Hash compression method, the exact message protocol, worker pool details.
- Mesh parameters for open-bottom and multi-slab cases, constrained by V2, V7 and V11.
- How copper and mask thickness are displayed per unit (µm / mil); the round-to-grid step per unit.
- Wording of messages and help text (English).

## 10. Calls Claude made (for the owner to check)

1. Drawn W = **base** width; trapezoid top narrower; S and G measured at the base; coplanar GND edges etched like the trace.
2. **Skipped copper layer** = cut out under the cross-section, filled with the adjacent prepreg's εr.
3. **Trace base rule:** the core neighbour if exactly one, else the lower one, overridable per layer. The trace layer is filled with the cover-side dielectric.
4. **No reference at all:** single-ended refused; pairs give Zdiff (odd mode) only.
5. Dielectric loss and delay for pairs use the **odd mode**.
6. **Skew** = tpd·|L1 − L2| for two nets with the same geometry. No cross-layer skew.
7. A layer with role `signal` may be chosen as a reference, with a warning; a role-review step follows KiCad import.
8. The worker pool, the URL hash in the fragment, a KiCad import that parses only the stackup and layers sections.
9. GitHub Actions CI added.

## Appendix A — reference formulas

- **K(k):** complete elliptic integral of the first kind via AGM (40 iterations); K′(k) = K(√(1−k²)).
- **Stripline (Cohn, T = 0, centred, homogeneous):** zr(k, εr) = 30π/√εr · K′(k)/K(k).
  - Single line: k = tanh(πW/2b).
  - Coupled lines: a = tanh(πW/2b), c = π(W+S)/2b, Zoe = zr(a·tanh c), Zoo = zr(a / tanh c).
- **Hammerstad-Jensen microstrip (T = 0, static):** u = W/H.
  - f = 6 + (2π−6)·exp(−(30.666/u)^0.7528)
  - Z0air = 376.73/(2π) · ln(f/u + √(1 + 4/u²))
  - a = 1 + ln((u⁴ + (u/52)²)/(u⁴ + 0.432))/49 + ln(1 + (u/18.1)³)/18.7
  - b = 0.564·((εr−0.9)/(εr+3))^0.053
  - εeff = (εr+1)/2 + (εr−1)/2 · (1 + 10/u)^(−a·b)
  - Z0 = Z0air/√εeff
- **CPW, infinitely thick substrate (T = 0):** k0 = W/(W+2G), εeff = (εr+1)/2, Z0 = 30π/√εeff · K′(k0)/K(k0).

## Appendix B — legacy validation cases (reproduced 2026-11-20 with the original solver)

**Microstrip vs HJ** (T = 0, no mask, H 0.12, εr 3.9, `SE(g, 4)`)

| dom | u | FD | HJ | Error |
|---|---|---|---|---|
| 1 | 0.5 | 100.440 | 100.513 | −0.07 % |
| 1 | 1 | 74.822 | 74.870 | −0.06 % |
| 1 | 2 | 51.349 | 51.387 | −0.07 % |
| 2 | 0.5 | 100.465 | 100.513 | −0.05 % |
| 2 | 1 | 74.846 | 74.870 | −0.03 % |
| 2 | 2 | 51.374 | 51.387 | −0.02 % |

**Coupled stripline vs Cohn** (W 0.15, S 0.25, b 0.4, εr 4, T 0, `DIFF(g, 4)`): Zodd −0.05 %, Zeven −0.06 %.

**Mesh: rich(1,2) vs rich(2,4)** (legacy grid)

Stackups used:
- inner = strip, T 0.035, H1 0.2, H2 0.14, εr 3.9 everywhere;
- outer = micro, T 0.035, H 0.12, εr 3.9, mask 0.01 / 3.3.

| Case | Normal | Fine | Difference |
|---|---|---|---|
| inner SE 0.125 | 50.107 | 50.105 | +0.004 % |
| outer SE 0.22 | 49.141 | 49.272 | −0.265 % (keyed mask wall: 49.229 / 49.225, 0.008 %) |
| outer CPWG 0.22, G 0.15 | 46.374 | 46.318 | +0.121 % |
| inner diff 0.125/0.2 | 91.159 | 91.150 | +0.011 % |
| outer diff 0.15/0.2 | 104.885 | 104.933 | −0.045 % |
| outer diff 0.3/0.18 | 73.494 | 73.529 | −0.046 % |

**Regression with the legacy grid** (example stackup, q = 2)

| Case | Z (Ω) |
|---|---|
| In5 SE 0.135 | 50.03 (q = 1: 50.04) |
| F.Cu SE 0.20 | 50.36 (keyed mask wall: 50.31) |
| F.Cu diff 0.17/0.27 | 100.78 |
| In5 diff 0.125/0.315 | 100.79 |
| F.Cu diff 0.21/0.25 | 90.18 |

Legacy geometry mapping:
- In5 = `{type:'strip', T 0.018, H1 0.20 / εr 4.35 (core, base), H2 0.14 / εr 3.93, erf 3.93}`;
- F.Cu = `{type:'micro', T 0.035, H 0.12, εr 4.17, tm 0.010, erm 3.3}`.
