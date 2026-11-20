import type { Topology } from '../model/crossSection';

const BASE: Record<Topology, string> = {
  microstrip: 'Microstrip',
  'embedded-microstrip': 'Embedded microstrip',
  'stripline-symmetric': 'Symmetric stripline',
  'stripline-asymmetric': 'Asymmetric stripline',
  'no-reference': 'No reference',
};

/** Topology label derived from the cross-section (spec §6.2); coplanar GND adds CPW / CPWG. */
export function topologyLabel(t: Topology, diff: boolean, cpw: boolean): string {
  let s = BASE[t];
  if (cpw) s = t === 'no-reference' ? 'CPW' : t === 'microstrip' ? 'CPWG' : `${s} + CPWG`;
  return diff ? `${s}, edge-coupled pair` : s;
}
