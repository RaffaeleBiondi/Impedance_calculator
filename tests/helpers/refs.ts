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
