import type { ImpClass } from '../state/types';
import type { Unit } from '../model/units';
import { toDisplay } from '../model/units';

/** Structural shape that the synthesis result satisfies. */
export type CellResult =
  | { ok: true; W: number; S?: number; z: number }
  | { ok: false; message: string };

export interface WidthRow {
  cls: ImpClass;
  layerName: string;
  main: CellResult;
  compact: CellResult;
}

function esc(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function num(v: number, digits: number): string {
  return Number.isFinite(v) ? String(Number(v.toFixed(digits))) : '';
}

const EPS = 1e-9;

export function widthTableCsv(rows: WidthRow[], unit: Unit, fmin: number): string {
  const header = [
    'Class', 'Type', 'Target (Ω)', 'Layer', `W (${unit})`, `Gap (${unit})`, 'Z (Ω)',
    'Deviation (%)', 'Fab check', `Compact W (${unit})`, `Compact gap (${unit})`, 'Compact Z (Ω)',
  ];
  const out = [header.map(esc).join(',')];
  for (const r of rows) {
    const m = r.main;
    const c = r.compact;
    let W = '', S = '', Z = '', dev = '', fab: string;
    if (m.ok) {
      W = num(toDisplay(m.W, unit), 4);
      S = m.S === undefined ? '' : num(toDisplay(m.S, unit), 4);
      Z = num(m.z, 2);
      dev = num(((m.z - r.cls.target) / r.cls.target) * 100, 2);
      const fine = m.W >= fmin - EPS && (m.S === undefined || m.S >= fmin - EPS);
      fab = fine ? 'OK' : 'below fab minimum';
    } else {
      fab = m.message;
    }
    let cW = '', cS = '', cZ = '';
    if (c.ok) {
      cW = num(toDisplay(c.W, unit), 4);
      cS = c.S === undefined ? '' : num(toDisplay(c.S, unit), 4);
      cZ = num(c.z, 2);
    }
    out.push([
      r.cls.name, r.cls.type === 'se' ? 'SE' : 'Diff', num(r.cls.target, 4), r.layerName,
      W, S, Z, dev, fab, cW, cS, cZ,
    ].map(esc).join(','));
  }
  return out.join('\r\n') + '\r\n';
}
