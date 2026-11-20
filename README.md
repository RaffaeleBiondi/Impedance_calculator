# LordOfTheOhms

Field-solver PCB impedance calculator for any stackup, in your browser.

> **Status: work in progress — the app is being built.** The design is written and implementation is starting. Nothing below is usable yet: features are described as planned for v1.

Live site: coming soon.

## What it is

LordOfTheOhms will be a free, public PCB transmission-line impedance calculator that runs entirely in the browser. You describe your stackup (any number of layers, your own materials, your own reference planes), pick a geometry, and get impedance from a real 2D quasi-static field solver, together with the assumptions behind the number and how the solver was validated.

### Why a field solver

Closed-form approximations (IPC-2141, Hammerstad-Jensen, Wheeler and similar) are fast, but each covers a narrow family of idealised geometries: one dielectric, one or two references, zero or nominal copper thickness. Real boards have mixed core and prepreg layers with different εr, solder mask on outer layers, finite copper thickness, coplanar grounds, trapezoidal etch and references that skip a layer. Outside a formula's fitted range the error is unknown.

A field solver computes the electrostatic field of the actual cross-section, so it handles any combination of layers and conductors with the same method, and its accuracy can be checked against exact solutions and refined by meshing more finely.

## How it works

- **Field solution:** a 2D quasi-static finite-volume solver on a graded rectilinear grid, refined near conductor edges where the field changes fastest.
- **Linear solver:** preconditioned conjugate gradient (PCG) with an incomplete Cholesky IC(0) preconditioner.
- **Impedance:** the capacitance per unit length C is computed from the field energy, once with the real dielectrics and once with air everywhere (C_air). Then Z0 = 1 / (c·√(C·C_air)) and εeff = C / C_air.
- **Differential pairs:** odd and even modes of edge-coupled pairs are solved on half of the cross-section, with a symmetry wall on the centre line (electric wall for odd mode, magnetic wall for even mode).
- **Accuracy:** Richardson extrapolation between two meshes, one twice as fine as the other, removes most of the discretisation error.
- **Synthesis:** finding W (or the gap) for a target impedance is a root-finding problem, solved in log space.
- **Most compact geometry:** given a target ±tol and a fab minimum for width and gap, the tool searches for the smallest geometry that stays inside the tolerance band. Because Z falls as W grows and rises as the gap grows, the optimum sits on a corner of the region allowed by the fab minimum and the tolerance band.

## Planned v1 features

- **Stackup editor:**
  - any number of copper layers, each with a name, a role (signal / plane / mixed) and a copper thickness;
  - dielectrics with material, type (core / prepreg), thickness, εr and tanδ;
  - top and bottom solder mask.
- **Reference planes:** choose the reference above and below the signal layer, including skipping layers.
- **Geometries:**
  - microstrip and embedded microstrip;
  - symmetric and asymmetric stripline;
  - coplanar waveguide (CPW), with and without a ground plane;
  - edge-coupled differential pairs, with and without coplanar GND.
- **Etch profile:** rectangular (default) or trapezoidal.
- **Results:**
  - Z0, Zdiff, Zodd, Zeven, Zcm;
  - εeff, delay, C and L per unit length;
  - a plot of the potential field;
  - dielectric loss;
  - delay and skew, when trace lengths are entered.
- **Synthesis:** find W for a target impedance, find the gap with W fixed, or find the most compact geometry.
- **Sweep:** chart of Z vs W or Z vs gap.
- **Width table:** for a stackup, impedance classes × signal layers, with CSV export.
- **Material library** with presets.
- **Persistence and sharing:** JSON import/export, shareable link, local autosave, and import of the stackup from a KiCad `.kicad_pcb` file.
- **Units:** mm, mil or µm.

## Accuracy and validation

LordOfTheOhms ports an existing field solver. These are the results of that original solver:

| Check | Result |
|---|---|
| Coupled stripline vs Cohn's exact formulas (T = 0) | Zodd −0.05 %, Zeven −0.06 % |
| Microstrip vs Hammerstad-Jensen (T = 0, W/H 0.5–2) | −0.02 to −0.07 % |
| Normal vs fine mesh, six cases | within 0.3 % |

Hammerstad-Jensen's own εeff accuracy is about 0.2 %, so the microstrip row shows agreement within the accuracy of the reference, not a 0.05 % solver accuracy.

Each new geometry will be validated against a closed form or a published reference, and the results will be recorded in `docs/validation.md`.

## Modelling assumptions and limitations

- **Quasi-static:** εr and tanδ are constant over frequency.
- **Losses:** no conductor loss and no surface roughness; only dielectric loss is computed.
- **Planes** are assumed solid.
- **Skipped reference layers:** a layer that is skipped is assumed to be cut out under the trace.
- **Solder mask** is modelled as a single conformal thickness.
- **Trapezoid default:** top width = W − 0.7·T. This is a rule of thumb: ask your fab for their etch profile.

## Privacy

- There is no backend: everything runs in your browser.
- Your stackups stay in your browser.
- Share links carry the state in the URL fragment (the part after `#`), which browsers do not send to the server.

## Development

These commands will be available once the app is scaffolded:

```sh
npm install     # install dependencies
npm run dev     # start the local dev server
npm test        # run the test suite
npm run build   # production build
```

## Deployment

Planned setup:

- A static Vite build on Vercel, connected to this GitHub repository.
- Pushes to `main` deploy to production, and pull requests get preview deployments.
- No environment variables are needed.
- The site is intentionally public. To restrict it, enable Vercel Authentication under **Project Settings → Deployment Protection**.

Live URL: coming soon.

## License

[MIT](LICENSE)
