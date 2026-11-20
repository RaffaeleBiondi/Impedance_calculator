const C0 = 299792458; // m/s

/** Dielectric attenuation in dB/m: 8.686·π·f·√εeff·tanδeff / c, with f in GHz. */
export function alphaDbPerM(fGHz: number, eeff: number, tandEff: number): number {
  return 8.686 * Math.PI * fGHz * 1e9 * Math.sqrt(eeff) * tandEff / C0;
}

/** Propagation delay in ps for a length in mm and tpd in ps/mm. */
export function delayPs(tpdPsPerMm: number, Lmm: number): number {
  return tpdPsPerMm * Lmm;
}

/** Skew in ps between two lengths (mm) at the same tpd (ps/mm). */
export function skewPs(tpdPsPerMm: number, L1mm: number, L2mm: number): number {
  return tpdPsPerMm * Math.abs(L1mm - L2mm);
}
