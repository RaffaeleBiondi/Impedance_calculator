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
const lines = (s: string) => s.replace(/^\uFEFF/, '').split('\r\n').filter((l) => l.length > 0);

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
  it('starts with a UTF-8 BOM so "Ω" opens correctly in spreadsheet apps', () => {
    const csv = widthTableCsv([], 'mm', 0.1);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).startsWith('Class,')).toBe(true);
  });
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx'])('prefixes a text cell starting with %j', (name) => {
    const q: ImpClass = { ...cls, name };
    const csv = widthTableCsv([{ cls: q, layerName: '=L1', main: ok(0.2, 50), compact: bad }], 'mm', 0.1);
    const row = csv.split('\r\n')[1];
    // class name and layer name both get the apostrophe (quoted when they hold CR)
    expect(row.replace(/^"/, '').startsWith(`'${name[0]}`)).toBe(true);
    expect(row).toContain(",'=L1,");
  });
  it('keeps negative numbers numeric (no prefix on numeric cells)', () => {
    const csv = widthTableCsv([{ cls, layerName: 'L1', main: ok(0.2, 48.5), compact: ok(0.2, 48) }], 'mm', 0.1);
    expect(lines(csv)[1].split(',').slice(-5)).toEqual(['-3', 'OK', '0.2', '', '48']);
  });
  it('prefixes a failure message that starts with a sign', () => {
    const m: CellResult = { ok: false, message: '-boom' };
    expect(lines(widthTableCsv([{ cls, layerName: 'L1', main: m, compact: bad }], 'mm', 0.1))[1]).toContain(",'-boom,");
  });
  it('writes failure text in the display unit with Ω, from the structured fields (mil)', () => {
    const below: CellResult = {
      ok: false, reason: 'below-fab', zRange: [38.21, 49.5],
      message: '50.0 ohm needs W 0.090 mm, below the fab minimum 0.127 mm; W from 0.127 mm gives 38.2 to 49.5 ohm',
    };
    const out: CellResult = { ok: false, reason: 'out-of-range', zRange: [60, 80], message: 'x 0.1 mm ohm' };
    const etch: CellResult = { ok: false, reason: 'error', message: 'Etched top width W_top = -0.0100 mm is not positive: widen the trace or check the etch rule' };
    const se: ImpClass = { ...cls, name: 'SE50' };
    const pitch: ImpClass = { ...se, type: 'diff', rule: { kind: 'fixed-pitch', pitch: 0.254 } };
    const noRoom: CellResult = { ok: false, reason: 'below-fab', message: 'Pitch 0.254 mm leaves no room for W and a gap of 0.127 mm' };
    const csv = widthTableCsv([
      { cls: se, layerName: 'L1', main: below, compact: bad },
      { cls: se, layerName: 'L1', main: out, compact: bad },
      { cls: se, layerName: 'L1', main: etch, compact: bad },
      { cls: pitch, layerName: 'L1', main: noRoom, compact: bad },
    ], 'mil', 0.127);
    const rows = lines(csv).slice(1);
    expect(rows[0]).toContain('50 Ω needs W below the fab minimum 5.00 mil; W ≥ 5.00 mil gives 38.2 to 49.5 Ω');
    expect(rows[1]).toContain('50 Ω is out of reach: Z goes from 60.0 to 80.0 Ω');
    expect(rows[2]).toContain('W_top = -0.39 mil is not positive');
    expect(rows[3]).toContain('Pitch 10.00 mil leaves no room for W and a gap of 5.00 mil');
    for (const r of rows) {
      expect(r).not.toMatch(/\bmm\b/);
      expect(r).not.toMatch(/\bohm\b/);
    }
  });
});
