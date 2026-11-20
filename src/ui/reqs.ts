import type { AnalyzeRequest } from '../solver/engine';
import type { AppState } from '../state/types';

/** Build an AnalyzeRequest from app state for a given layer, refs, type, geometry and coplanar gap. */
export function buildReq(
  s: AppState,
  sel: { layerId: string; refAbove: string | null; refBelow: string | null },
  line: { type: 'se' | 'diff'; W: number; S: number; G: number | null },
): AnalyzeRequest {
  return {
    stackup: s.stackup,
    sel,
    line: { type: line.type, W: line.W, S: line.type === 'diff' ? line.S : undefined, G: line.G, etch: s.stackup.etch.mode === 'trap' },
    q: s.calc.q,
    freqGHz: s.calc.freqGHz,
  };
}
