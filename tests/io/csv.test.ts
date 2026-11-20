import { describe, it, expect } from 'vitest';
import { widthTableCsv, type CellResult } from '../../src/io/csv';
import type { ImpClass } from '../../src/state/types';

const cls: ImpClass = {
  id: 'c1', name: '50 ohm, SE', type: 'se', target: 50,
  rule: { mode: 'fixed' } as unknown as ImpClass['rule'], G: null,
};
const ok = (W: number, z: number, S?: number): CellResult =>
  S === undefined ? { ok: true, W, z } : { ok: true, W, S, z };
const bad: CellResult = { ok: false, message: 'target out of reach' };
const lines = (s: string) => s.split('\r\n').filter((l) => l.length > 0);

describe('widthTableCsv', () => {
  it('writes the header for the unit', () => {
    const csv = widthTableCsv([], 'mil', 0.1);
    expect(lines(csv)[0]).toBe(
      'Class,Type,Target (Ω),Layer,W (mil),Gap (mil),Z (Ω),Deviation (%),Fab check,Compact W (mil),Compact gap (mil),Compact Z (Ω)');
  });
  it('writes values in the requested unit with a dot decimal and deviation', () => {
    const csv = widthTableCsv(
      [{ cls, layerName: 'L1', main: ok(0.127, 50.5), compact: ok(0.1, 49) }], 'mil', 0.1);
    const r = lines(csv)[1];
    expect(r).toBe('"50 ohm, SE",SE,50,L1,5,,50.5,1,OK,3.937,,49');
  });
  it('flags values below the fab minimum', () => {
    const csv = widthTableCsv(
      [{ cls, layerName: 'L1', main: ok(0.05, 50), compact: ok(0.05, 50) }], 'mm', 0.1);
    expect(lines(csv)[1]).toContain('below fab minimum');
  });
  it('checks the gap too and writes it for pairs', () => {
    const d: ImpClass = { ...cls, name: 'D', type: 'diff', target: 90 };
    const csv = widthTableCsv(
      [{ cls: d, layerName: 'L1', main: ok(0.15, 90, 0.05), compact: ok(0.15, 90, 0.2) }], 'mm', 0.1);
    expect(lines(csv)[1]).toBe('D,Diff,90,L1,0.15,0.05,90,0,below fab minimum,0.15,0.2,90');
  });
  it('puts a failed cell message in Fab check and blanks the numbers', () => {
    const csv = widthTableCsv(
      [{ cls, layerName: 'L1', main: bad, compact: bad }], 'mm', 0.1);
    expect(lines(csv)[1]).toBe('"50 ohm, SE",SE,50,L1,,,,,target out of reach,,,');
  });
  it('quotes fields containing commas or quotes (RFC 4180)', () => {
    const q: ImpClass = { ...cls, name: 'say "hi", ok' };
    const csv = widthTableCsv(
      [{ cls: q, layerName: 'L1', main: ok(0.2, 50), compact: bad }], 'mm', 0.1);
    expect(lines(csv)[1].startsWith('"say ""hi"", ok",')).toBe(true);
  });
});
