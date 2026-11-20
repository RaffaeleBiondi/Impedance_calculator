import { describe, it, expect } from 'vitest';
import {
  cohnStrip, hjMicrostrip, cpwInfinite,
  kjCoupledMicrostrip, offsetStripline, embeddedMicrostrip, embedFromSurface, cpwFinite, cpwg,
} from './refs';

const rel = (a: number, b: number): number => Math.abs(a - b) / b;

describe('kjCoupledMicrostrip', () => {
  const cases: Array<[number, number, number]> = [
    [0.5, 0.5, 4.5], [1, 1, 4.5], [2, 0.3, 9.8], [0.3, 2, 3.4], [5, 5, 12], [1, 0.1, 2.2], [10, 10, 4.5],
  ];
  it('zoe > zoo and eeffEven > eeffOdd in every case', () => {
    for (const [u, g, er] of cases) {
      const r = kjCoupledMicrostrip(u, g, 1, er);
      expect(r.zoe).toBeGreaterThan(r.zoo);
      expect(r.eeffEven).toBeGreaterThan(r.eeffOdd);
    }
  });
  it('uncoupled limit (S = 50 H) tends to the single line within 1 %', () => {
    for (const [u, , er] of cases.filter(c => c[0] <= 10)) {
      const r = kjCoupledMicrostrip(u, 50, 1, er);
      const s = hjMicrostrip(u, er);
      expect(rel(r.zoe, s.z0)).toBeLessThan(0.01);
      expect(rel(r.zoo, s.z0)).toBeLessThan(0.01);
    }
  });
  it('is invariant to a uniform scaling of W, S, H', () => {
    const a = kjCoupledMicrostrip(0.2, 0.15, 0.1, 4.2);
    const b = kjCoupledMicrostrip(2, 1.5, 1, 4.2);
    expect(a.zoe).toBeCloseTo(b.zoe, 9);
    expect(a.zoo).toBeCloseTo(b.zoo, 9);
  });
  it('tighter spacing widens the even/odd split', () => {
    const tight = kjCoupledMicrostrip(1, 0.2, 1, 4.5);
    const loose = kjCoupledMicrostrip(1, 2, 1, 4.5);
    expect(tight.zoe - tight.zoo).toBeGreaterThan(loose.zoe - loose.zoo);
  });
  it('regression pin: W 1, S 0.5, H 1, er 4.4', () => {
    // Pinned values; the Task 6a review checked them against qucs-core (mscoupled.cpp, Kirschning
    // static branch) and an independent FD solve.
    const r = kjCoupledMicrostrip(1, 0.5, 1, 4.4);
    expect(r.zoe).toBeCloseTo(86.597, 3);
    expect(r.zoo).toBeCloseTo(53.092, 3);
    expect(r.eeffEven).toBeCloseTo(3.3824, 3);
    expect(r.eeffOdd).toBeCloseTo(2.8280, 3);
  });
  it('air substrate: both effective permittivities are 1', () => {
    const r = kjCoupledMicrostrip(1, 0.5, 1, 1);
    expect(r.eeffEven).toBeCloseTo(1, 12);
    expect(r.eeffOdd).toBeCloseTo(1, 12);
  });
  it('single-line impedance lies between the odd and even values', () => {
    for (const [u, g, er] of cases) {
      const r = kjCoupledMicrostrip(u, g, 1, er);
      const z = hjMicrostrip(u, er).z0;
      expect(r.zoo).toBeLessThan(z);
      expect(r.zoe).toBeGreaterThan(z);
    }
  });
});

describe('offsetStripline', () => {
  it('H1 = H2 = b/2 equals Cohn centred stripline (within 2 %; exact by construction)', () => {
    for (const [W, b, er] of [[0.2, 0.4, 4.2], [0.5, 0.4, 3.5], [0.1, 0.8, 4.5], [1, 0.5, 2.2]]) {
      expect(rel(offsetStripline(W, b / 2, b / 2, er), cohnStrip(W, b, er))).toBeLessThan(0.02);
    }
  });
  it('fixed plane spacing: the trace nearest a plane has the lowest Z0, centre the highest', () => {
    const b = 0.6, W = 0.15, er = 4.2;
    let prev = 0;
    for (const h1 of [0.05, 0.1, 0.2, 0.3]) {
      const z = offsetStripline(W, h1, b - h1, er);
      expect(z).toBeGreaterThan(prev);
      prev = z;
    }
  });
  it('is symmetric in H1 <-> H2', () => {
    expect(offsetStripline(0.2, 0.1, 0.5, 4)).toBeCloseTo(offsetStripline(0.2, 0.5, 0.1, 4), 12);
  });
  it('scales as 1/sqrt(er)', () => {
    expect(offsetStripline(0.2, 0.1, 0.3, 4) * 2).toBeCloseTo(offsetStripline(0.2, 0.1, 0.3, 1), 9);
  });
});

describe('embeddedMicrostrip', () => {
  it('Hcover -> 0 tends to hjMicrostrip (<= 1 %)', () => {
    for (const [W, H, er] of [[0.2, 0.1, 4.2], [0.5, 0.2, 3.5], [0.1, 0.1, 9.8]]) {
      const e = embeddedMicrostrip(W, H, 1e-6, er);
      const s = hjMicrostrip(W / H, er);
      expect(rel(e.z0, s.z0)).toBeLessThan(0.01);
      expect(rel(e.eeff, s.eeff)).toBeLessThan(0.01);
    }
  });
  it('eeff stays between the microstrip eeff and er, and rises monotonically with cover', () => {
    const s = hjMicrostrip(2, 4.2);
    let prev = s.eeff;
    for (const hc of [0.05, 0.1, 0.3, 1, 5]) {
      const e = embeddedMicrostrip(0.2, 0.1, hc, 4.2);
      expect(e.eeff).toBeGreaterThanOrEqual(prev);
      expect(e.eeff).toBeGreaterThan(s.eeff);
      expect(e.eeff).toBeLessThanOrEqual(4.2);
      prev = e.eeff;
    }
  });
  it('deep burial: eeff -> er and Z0 -> Z0air/sqrt(er)', () => {
    const e = embeddedMicrostrip(0.2, 0.1, 50, 4.2);
    expect(e.eeff).toBeCloseTo(4.2, 6);
    const s = hjMicrostrip(2, 4.2);
    expect(e.z0).toBeCloseTo(s.z0 * Math.sqrt(s.eeff / 4.2), 5);
  });
  it('arithmetic check vs independently published implementation values (pcb-toolkit test): ' +
     'surface Z0 44.832 ohm, eeff 3.3075, cover 1, H 5, er 4.6 -> 42.196 ohm, eeff 3.7336', () => {
    // Applies our embedded equations (the helper embeddedMicrostrip uses) to the surface values
    // quoted in that test; it checks our transcription of the two equations, not the physics.
    const e = embedFromSurface({ z0: 44.832, eeff: 3.3075 }, 5, 1, 4.6);
    expect(e.eeff).toBeCloseTo(3.7336, 3);
    expect(e.z0).toBeCloseTo(42.196, 2);
  });
  it('embeddedMicrostrip is embedFromSurface applied to hjMicrostrip', () => {
    const e = embeddedMicrostrip(0.2, 0.1, 0.05, 4.4);
    const f = embedFromSurface(hjMicrostrip(2, 4.4), 0.1, 0.05, 4.4);
    expect(e.z0).toBe(f.z0);
    expect(e.eeff).toBe(f.eeff);
  });
});

describe('cpwFinite', () => {
  it('h -> inf tends to cpwInfinite (<= 0.5 %)', () => {
    for (const [W, G, er] of [[0.2, 0.1, 4.2], [0.5, 0.2, 9.8], [0.1, 0.3, 3.5]]) {
      const h = 100 * (W + 2 * G);
      const f = cpwFinite(W, G, h, er);
      const i = cpwInfinite(W, G, er);
      expect(rel(f.z0, i.z0)).toBeLessThan(0.005);
      expect(rel(f.eeff, i.eeff)).toBeLessThan(0.005);
    }
  });
  it('thinner substrate lowers eeff and raises Z0; eeff stays within [1, (er+1)/2]', () => {
    let prevE = Infinity, prevZ = 0;
    for (const h of [10, 2, 0.5, 0.1]) {
      const f = cpwFinite(0.2, 0.1, h, 4.2);
      expect(f.eeff).toBeGreaterThan(1);
      expect(f.eeff).toBeLessThanOrEqual(5.2 / 2 + 1e-9);
      expect(f.eeff).toBeLessThan(prevE);
      expect(f.z0).toBeGreaterThan(prevZ);
      prevE = f.eeff; prevZ = f.z0;
    }
  });
  it('air substrate: eeff = 1', () => {
    expect(cpwFinite(0.2, 0.1, 0.3, 1).eeff).toBeCloseTo(1, 12);
  });
});

describe('cpwg', () => {
  it('h -> inf tends to cpwInfinite (<= 1 %)', () => {
    for (const [W, G, er] of [[0.2, 0.1, 4.2], [0.5, 0.2, 9.8], [0.1, 0.3, 3.5]]) {
      const h = 100 * (W + 2 * G);
      const f = cpwg(W, G, h, er);
      const i = cpwInfinite(W, G, er);
      expect(rel(f.z0, i.z0)).toBeLessThan(0.01);
    }
  });
  it('smaller h lowers Z0 and raises eeff', () => {
    let prevZ = Infinity, prevE = 0;
    for (const h of [5, 1, 0.3, 0.1]) {
      const f = cpwg(0.2, 0.15, h, 4.2);
      expect(f.z0).toBeLessThan(prevZ);
      expect(f.eeff).toBeGreaterThan(prevE);
      expect(f.eeff).toBeLessThanOrEqual(4.2);
      prevZ = f.z0; prevE = f.eeff;
    }
  });
  it('a back ground plane lowers Z0 relative to the unbacked CPW (same W, G, h)', () => {
    for (const h of [0.05, 0.2, 1]) {
      expect(cpwg(0.2, 0.15, h, 4.2).z0).toBeLessThan(cpwFinite(0.2, 0.15, h, 4.2).z0);
    }
  });
});
