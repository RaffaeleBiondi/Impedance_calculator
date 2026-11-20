import type { ImpClass } from '../state/types';
import type { Unit } from '../model/units';
import { toDisplay } from '../model/units';
import { failText, type Fail } from '../ui/synthText';

/** Structural shape that the synthesis result satisfies. */
export type CellResult =
  | { ok: true; W: number; S?: number; z: number }
  | ({ ok: false; detail?: string } & Fail);

/** Display text of a failed main-column cell, in the display unit with Ω (the worker text is mm / ohm). */
export function mainFailText(c: Fail, cls: ImpClass, unit: Unit, fmin: number): string {
  // op 'findW' text never uses W or the tolerance
  return failText(c, {
    op: 'findW', target: cls.target, tolPct: 0, fmin, W: 0, unit,
    pitch: cls.rule.kind === 'fixed-pitch' ? cls.rule.pitch : undefined,
  });
}

export interface WidthRow {
  cls: ImpClass;
  layerName: string;
  main: CellResult;
  compact: CellResult;
}

/** RFC 4180 quoting. */
function esc(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Text cells (names, messages) that a spreadsheet would read as a formula get a leading apostrophe.
 * Numeric cells are written by num() and never pass through here, so negative numbers stay numeric.
 */
function txt(s: string): string {
  return esc(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
}

/** UTF-8 byte order mark, so spreadsheet apps read "Ω" correctly. */
export const BOM = '\uFEFF';

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
    let Wd = '', S = '', Z = '', dev = '', fab: string;
    if (m.ok) {
      Wd = num(toDisplay(m.W, unit), 4);
      S = m.S === undefined ? '' : num(toDisplay(m.S, unit), 4);
      Z = num(m.z, 2);
      dev = num(((m.z - r.cls.target) / r.cls.target) * 100, 2);
      const fine = m.W >= fmin - EPS && (m.S === undefined || m.S >= fmin - EPS);
      fab = fine ? 'OK' : 'below fab minimum';
    } else {
      fab = mainFailText(m, r.cls, unit, fmin);
    }
    let cW = '', cS = '', cZ = '';
    if (c.ok) {
      cW = num(toDisplay(c.W, unit), 4);
      cS = c.S === undefined ? '' : num(toDisplay(c.S, unit), 4);
      cZ = num(c.z, 2);
    }
    out.push([
      txt(r.cls.name), r.cls.type === 'se' ? 'SE' : 'Diff', num(r.cls.target, 4), txt(r.layerName),
      esc(Wd), esc(S), esc(Z), esc(dev), txt(fab), esc(cW), esc(cS), esc(cZ),
    ].join(','));
  }
  return BOM + out.join('\r\n') + '\r\n';
}
