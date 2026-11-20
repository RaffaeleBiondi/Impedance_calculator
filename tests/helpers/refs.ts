import { ellipK } from '../../src/solver/elliptic';

// Reference formulas, spec Appendix A.

const kPrime = (k: number): number => ellipK(Math.sqrt(1 - k * k));
const zr = (k: number, er: number): number => (30 * Math.PI / Math.sqrt(er)) * kPrime(k) / ellipK(k);

/** Cohn stripline (T = 0, centred, homogeneous). */
export function cohnStrip(W: number, b: number, er: number): number {
  return zr(Math.tanh(Math.PI * W / (2 * b)), er);
}

/** Cohn coupled stripline: even / odd mode impedances. */
export function cohnCoupled(W: number, S: number, b: number, er: number): { zoe: number; zoo: number } {
  const a = Math.tanh(Math.PI * W / (2 * b));
  const c = Math.PI * (W + S) / (2 * b);
  return { zoe: zr(a * Math.tanh(c), er), zoo: zr(a / Math.tanh(c), er) };
}

/** Hammerstad-Jensen static microstrip (T = 0), u = W/H. */
export function hjMicrostrip(u: number, er: number): { z0: number; eeff: number } {
  const f = 6 + (2 * Math.PI - 6) * Math.exp(-Math.pow(30.666 / u, 0.7528));
  const z0air = 376.73 / (2 * Math.PI) * Math.log(f / u + Math.sqrt(1 + 4 / (u * u)));
  const a = 1 + Math.log((Math.pow(u, 4) + Math.pow(u / 52, 2)) / (Math.pow(u, 4) + 0.432)) / 49
    + Math.log(1 + Math.pow(u / 18.1, 3)) / 18.7;
  const b = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  const eeff = (er + 1) / 2 + (er - 1) / 2 * Math.pow(1 + 10 / u, -a * b);
  return { z0: z0air / Math.sqrt(eeff), eeff };
}

/** CPW on an infinitely thick substrate (T = 0). */
export function cpwInfinite(W: number, G: number, er: number): { z0: number; eeff: number } {
  const k0 = W / (W + 2 * G);
  const eeff = (er + 1) / 2;
  return { z0: (30 * Math.PI / Math.sqrt(eeff)) * kPrime(k0) / ellipK(k0), eeff };
}

// ---------------------------------------------------------------------------
// Task 6a: reference formulas for the generalised geometries.
// Everything below is a TEST HELPER. Lengths in mm, impedances in ohm.
// Sources are cited per function; accuracy figures are the ones the sources
// state, nothing more. Where a source states none, the JSDoc says so.
// ---------------------------------------------------------------------------

const ZF = 377; // ohm, free-space impedance as printed in Qucs eq. (11.118)/(11.123)

/**
 * Kirschning-Jansen static coupled microstrip, zero thickness, no dispersion.
 *
 * Source: Qucs Technical Papers (Jehle, Margraf et al.), section "Parallel
 * coupled microstrip lines / Kirschning and Jansen", eqs. (11.89)-(11.99) for
 * the static effective permittivities and (11.118)-(11.129) for the static
 * impedances (https://qucs.sourceforge.net/tech/node77.html, same equations
 * in docs/technical/technical.pdf). Cross-checked line by line against the
 * Qucs-core implementation (qucs-core/src/components/microstrip/mscoupled.cpp,
 * "Kirschning" static branch, T = 0). The Qucs text cites M. Kirschning and
 * R. H. Jansen, "Accurate wide-range design equations for the
 * frequency-dependent characteristic of parallel coupled microstrip lines",
 * IEEE Trans. MTT-32 (1984), and Hammerstad & Jensen, IEEE MTT-S 1980, for
 * the single-line quantities eps_eff(0) and Z_L(0) (see hjMicrostrip).
 * The Qucs text gives the free-space impedance as 377 ohm in (11.118) and
 * (11.123); the code uses 376.73 (effect < 0.1 % of the correction term).
 *
 * Validity (Qucs eq. 11.90): 0.1 <= W/H <= 10, 0.1 <= S/H <= 10, 1 <= er <= 18.
 * Stated accuracy: static impedances better than 0.6 % (Qucs text after
 * eq. 11.129), within that range. Formulas run outside the range, but no
 * accuracy is stated there.
 */
export function kjCoupledMicrostrip(W: number, S: number, H: number, er: number):
  { zoe: number; zoo: number; eeffEven: number; eeffOdd: number } {
  const u = W / H;
  const g = S / H;
  const single = hjMicrostrip(u, er); // Z_L(0), eps_eff(0) of the single zero-thickness line
  const e0 = single.eeff;
  const zl = single.z0;
  const eMean = 0.5 * (er + 1);

  // Even mode, eqs. (11.91)-(11.94): Hammerstad a(v), b(er) evaluated at v.
  const v = u * (20 + g * g) / (10 + g * g) + g * Math.exp(-g);
  const eeffEven = hjMicrostrip(v, er).eeff;

  // Odd mode, eqs. (11.95)-(11.99).
  const ao = 0.7287 * (e0 - eMean) * (1 - Math.exp(-0.179 * u));
  const bo = 0.747 * er / (0.15 + er);
  const co = bo - (bo - 0.207) * Math.exp(-0.414 * u);
  const dO = 0.593 + 0.694 * Math.exp(-0.562 * u);
  const eeffOdd = (eMean + ao - e0) * Math.exp(-co * Math.pow(g, dO)) + e0;

  // Even impedance, eqs. (11.118)-(11.122).
  const q1 = 0.8695 * Math.pow(u, 0.194);
  const q2 = 1 + 0.7519 * g + 0.189 * Math.pow(g, 2.31);
  const q3 = 0.1975 + Math.pow(16.6 + Math.pow(8.4 / g, 6), -0.387)
    + Math.log(Math.pow(g, 10) / (1 + Math.pow(g / 3.4, 10))) / 241;
  const q4 = (q1 / q2) * 2 / (Math.exp(-g) * Math.pow(u, q3) + (2 - Math.exp(-g)) * Math.pow(u, -q3));
  const zoe = Math.sqrt(e0 / eeffEven) * zl / (1 - (zl / ZF) * Math.sqrt(e0) * q4);

  // Odd impedance, eqs. (11.123)-(11.129).
  const q5 = 1.794 + 1.14 * Math.log(1 + 0.638 / (g + 0.517 * Math.pow(g, 2.43)));
  const q6 = 0.2305 + Math.log(Math.pow(g, 10) / (1 + Math.pow(g / 5.8, 10))) / 281.3
    + Math.log(1 + 0.598 * Math.pow(g, 1.154)) / 5.1;
  const q7 = (10 + 190 * g * g) / (1 + 82.3 * g * g * g);
  const q8 = Math.exp(-6.5 - 0.95 * Math.log(g) - Math.pow(g / 0.15, 5));
  const q9 = Math.log(q7) * (q8 + 1 / 16.5);
  const q10 = q4 - (q5 / q2) * Math.pow(u, q6 * Math.pow(u, -q9));
  const zoo = Math.sqrt(e0 / eeffOdd) * zl / (1 - (zl / ZF) * Math.sqrt(e0) * q10);

  return { zoe, zoo, eeffEven, eeffOdd };
}

/**
 * Offset (asymmetric) stripline, zero thickness: parallel combination of the
 * two half-structures, Z0 = 2 Z1 Z2 / (Z1 + Z2) with Zi = Cohn centred
 * stripline of plane spacing 2*Hi (i.e. cohnStrip(W, 2*Hi, er)).
 *
 * Source / derivation: each plane contributes the capacitance of half of a
 * centred strip whose plane spacing is 2*Hi, and the two add, so
 * Z0 = 2 Z1 Z2 / (Z1 + Z2). This is the Z0,air combination used in the
 * Wadell-based asymmetric-stripline calculators (Wadell, Transmission Line
 * Design Handbook, 1991, sec. 3.4.2 as cited by the open-source pcb-toolkit
 * crate src/impedance/stripline.rs; same combination as Z0,air on the All
 * About Circuits asymmetric-stripline page, which attributes its further
 * correction term to IPC-2141A). I could not open Wadell or IPC-2141A
 * themselves, so the correction term dZ0,air (whose printed form on that page
 * contains an evident typo) is NOT included.
 *
 * Exact when H1 = H2 (reduces to Cohn). For H1 != H2 the fringing field
 * coupling between the two half-spaces is neglected; NO accuracy figure for
 * this is published in the sources I could open. Treat it as a first-order
 * reference whose error grows with offset and W/(H1+H2); Task 6b should
 * compare it to the solver with a tolerance chosen from observed behaviour
 * and say so.
 *
 * H1, H2: distance from the (zero-thickness) trace to each plane.
 */
export function offsetStripline(W: number, H1: number, H2: number, er: number): number {
  const z1 = cohnStrip(W, 2 * H1, er);
  const z2 = cohnStrip(W, 2 * H2, er);
  return 2 * z1 * z2 / (z1 + z2);
}

/**
 * Embedded (buried) microstrip, zero thickness: surface Hammerstad-Jensen
 * microstrip covered by dielectric of the same er, thickness Hcover, then air.
 *
 *   eeff_emb = er - (er - eeff_surf) * exp(-2 Hcover / H)
 *   Z0_emb   = Z0_surf * sqrt(eeff_surf / eeff_emb)      (Z0 = Z0air / sqrt(eeff))
 *
 * Source: Wadell, Transmission Line Design Handbook (1991) sec. 3.5.4 as
 * implemented in the open-source pcb-toolkit crate (src/impedance/embedded.rs),
 * and the same exp(-2b/H1) weighting with b = cover thickness in the IPC-2141A
 * embedded-microstrip impedance equation as reproduced by the All About
 * Circuits embedded-microstrip page. Both are secondary sources; Wadell and
 * IPC-2141A themselves were not accessible. NOT the older IPC-2251 draft
 * form (87/sqrt(er(1-exp(-1.55B/H))+1.41) ln(...)), which is a different
 * formula.
 *
 * Limits: Hcover -> 0 gives the surface microstrip, Hcover -> inf gives
 * eeff = er. Stated accuracy: none found in an open source. The IPC
 * literature calls embedded-microstrip formulas "an approximation" and
 * reports 20-40 % error vs a field solver for the (different) IPC-2251 draft
 * form (Clemson EMC lab page); do not read that as this formula's accuracy.
 * Treat as an approximate reference with a loose tolerance.
 */
export function embeddedMicrostrip(W: number, H: number, Hcover: number, er: number):
  { z0: number; eeff: number } {
  return embedFromSurface(hjMicrostrip(W / H, er), H, Hcover, er);
}

/** The two embedded-microstrip equations above, applied to given surface-microstrip values. */
export function embedFromSurface(surf: { z0: number; eeff: number }, H: number, Hcover: number, er: number):
  { z0: number; eeff: number } {
  const eeff = er - (er - surf.eeff) * Math.exp(-2 * Hcover / H);
  return { z0: surf.z0 * Math.sqrt(surf.eeff / eeff), eeff };
}

/**
 * Conventional CPW, centre strip W, slots G, zero thickness, on a substrate of
 * finite thickness h with air below and above (no backside metal).
 *
 * Source: Qucs Technical Papers sec. 12.1.2 (https://qucs.sourceforge.net,
 * "Coplanar waveguides (CPW)", eqs. 12.7, 12.8, 12.9, with s = G); same as
 * the Ghione-Naldi / Simons conformal-mapping result (Simons, Coplanar
 * Waveguide Circuits, Components, and Systems, Wiley 2001, ch. 2).
 *   k1 = W/(W+2G), k2 = sinh(pi W/4h) / sinh(pi (W+2G)/4h)
 *   eeff = 1 + (er-1)/2 * K(k2)/K'(k2) * K'(k1)/K(k1)
 *   Z0   = 30 pi / sqrt(eeff) * K'(k1)/K(k1)
 *
 * Magnetic-wall conformal-mapping approximation. Qucs states the K/K'
 * evaluation is accurate to ~1e-5 but gives NO accuracy figure for the model
 * itself. h -> inf recovers cpwInfinite exactly (eeff = (er+1)/2).
 */
export function cpwFinite(W: number, G: number, h: number, er: number): { z0: number; eeff: number } {
  const k1 = W / (W + 2 * G);
  const k2 = Math.sinh(Math.PI * W / (4 * h)) / Math.sinh(Math.PI * (W + 2 * G) / (4 * h));
  const eeff = 1 + (er - 1) / 2 * (ellipK(k2) / kPrime(k2)) * (kPrime(k1) / ellipK(k1));
  return { z0: (30 * Math.PI / Math.sqrt(eeff)) * kPrime(k1) / ellipK(k1), eeff };
}

/**
 * Conductor-backed CPW (CPWG): CPW on a substrate of thickness h with a ground
 * plane on the back, zero thickness.
 *
 * Source: Qucs Technical Papers sec. 12.1.2, eqs. 12.10-12.13 (s = G); this is
 * the Ghione & Naldi (1987) partial-capacitance result also given in Simons,
 * Coplanar Waveguide Circuits, Components, and Systems (2001) ch. 2.
 *   k1 = W/(W+2G), k3 = tanh(pi W/4h) / tanh(pi (W+2G)/4h)
 *   q  = [K(k3)/K'(k3)] / [K(k1)/K'(k1) + K(k3)/K'(k3)]
 *   eeff = 1 + q (er-1)
 *   Z0 = 60 pi / sqrt(eeff) / [K(k1)/K'(k1) + K(k3)/K'(k3)]
 *
 * Stated accuracy: none in the Qucs text (conformal-mapping, magnetic-wall
 * approximation; K/K' evaluation ~1e-5). h -> inf tends to cpwInfinite.
 */
export function cpwg(W: number, G: number, h: number, er: number): { z0: number; eeff: number } {
  const k1 = W / (W + 2 * G);
  const k3 = Math.tanh(Math.PI * W / (4 * h)) / Math.tanh(Math.PI * (W + 2 * G) / (4 * h));
  const r1 = ellipK(k1) / kPrime(k1);
  const r3 = ellipK(k3) / kPrime(k3);
  const eeff = 1 + (r3 / (r1 + r3)) * (er - 1);
  return { z0: (60 * Math.PI / Math.sqrt(eeff)) / (r1 + r3), eeff };
}
