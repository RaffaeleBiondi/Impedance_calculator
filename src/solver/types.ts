export interface Rect { x0: number; x1: number; y0: number; y1: number }
export interface DielRect extends Rect { er: number; tand?: number } // tand undefined = 0
export interface CondRect extends Rect { v: 0 | 1 }
export type Mode = 'se' | 'odd' | 'even';
export interface Problem {
  xmax: number; ymax: number;
  leftBC: 'neumann' | 'dirichlet'; topBC: 'ground' | 'neumann';
  diel: DielRect[]; cond: CondRect[];
  keysX: number[]; keysY: number[]; fineX: number[]; fineY: number[];
  hmin: number; hmax: number; hminX?: number; hmaxX?: number; hmaxY?: number; growth: number;
}
export interface Grid { xs: Float64Array; ys: Float64Array }
export interface CapResult { c: number; V: Float64Array; iters: number; nx: number; ny: number; tandEff?: number /* energy-weighted loss tangent, only with dielectrics */ }
export type BuildFn = (mode: Mode, q: number) => Problem;
export interface FieldData { V: Float64Array; xs: Float64Array; ys: Float64Array }
export interface SEResult {
  Z0: number; eeff: number; tpd: number /* ns/m = ps/mm */; C: number;
  nodes: number; iters: number; field: FieldData; meshDelta?: number; tandEff?: number;
}
export interface DiffResult {
  Zodd: number; Zeven: number; Zdiff: number; Zcm: number; eodd: number; eeven: number;
  tpdOdd: number; kb: number; nodes: number; iters: number; field: FieldData; meshDelta?: number; tandEffOdd?: number;
}
