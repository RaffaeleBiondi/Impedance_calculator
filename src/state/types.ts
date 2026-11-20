import type { Stackup } from '../model/stackup';
import { coppers } from '../model/stackup';
import { exampleStackup } from '../model/example';
import type { GapRule } from '../model/gapRule';
import type { Unit } from '../model/units';

export interface CalcState {
  layerId: string; refAbove: string | null; refBelow: string | null;
  type: 'se' | 'diff'; cpw: boolean;
  W: number; S: number; G: number; target: number; fmin: number; tol: number;
  compact: boolean; q: 1 | 2;
  freqGHz: number; L1: number | null; L2: number | null;
}
export interface ImpClass {
  id: string; name: string; type: 'se' | 'diff'; target: number; rule: GapRule; G: number | null;
}
export interface AppState {
  stackup: Stackup; calc: CalcState; unit: Unit; classes: ImpClass[]; tableLayers: string[];
}

export function defaultAppState(): AppState {
  const stackup = exampleStackup();
  const tableLayers = coppers(stackup).filter((c) => c.role !== 'plane').map((c) => c.id);
  return {
    stackup,
    calc: {
      layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6', type: 'se', cpw: false,
      W: 0.135, S: 0.2, G: 0.2, target: 50, fmin: 0.125, tol: 5,
      compact: false, q: 2, freqGHz: 1, L1: null, L2: null,
    },
    unit: 'mm',
    classes: [
      { id: 'cls-se50', name: 'SE 50', type: 'se', target: 50, rule: { kind: 'compact-at-target' }, G: null },
      { id: 'cls-diff100', name: 'DIFF 100', type: 'diff', target: 100, rule: { kind: 'compact-at-target' }, G: null },
      { id: 'cls-diff90', name: 'DIFF 90', type: 'diff', target: 90, rule: { kind: 'compact-at-target' }, G: null },
    ],
    tableLayers,
  };
}
