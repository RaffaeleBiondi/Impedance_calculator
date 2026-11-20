import { describe, expect, it, vi } from 'vitest';

let forceTooLarge = false;
vi.mock('../../src/solver/engine', async (orig) => {
  const m = await orig<typeof import('../../src/solver/engine')>();
  return {
    ...m,
    analyze: (req: Parameters<typeof m.analyze>[0]) =>
      forceTooLarge ? { ok: false as const, error: 'Geometry too large for the solver: 999999 mesh nodes exceed the 400000 cap' } : m.analyze(req),
  };
});
import type { Selection } from '../../src/model/crossSection';
import { exampleStackup } from '../../src/model/example';
import type { AnalyzeRequest } from '../../src/solver/engine';
import {
  compactAtTarget, compactWithinTol, findS, findW, roundToStep, tableCell, type SynthResult,
} from '../../src/solver/synthesis';

const ex = exampleStackup();
const strip: Selection = { layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' };
const micro: Selection = { layerId: 'cu0', refAbove: null, refBelow: 'cu1' };
const se = (sel = strip): AnalyzeRequest => ({ stackup: ex, sel, line: { type: 'se', W: 0.2, etch: false }, q: 1 });
const diff = (sel = strip, W = 0.125, S = 0.3): AnalyzeRequest => ({ stackup: ex, sel, line: { type: 'diff', W, S, etch: false }, q: 1 });
const ok = (r: SynthResult) => { if (!r.ok) throw new Error(r.message); return r; };

describe('synthesis', () => {
  it('findW cu5 SE 50 ohm', () => {
    const r = ok(findW(se(), 50));
    expect(Math.abs(r.W - 0.135)).toBeLessThan(0.002);
  });
  it('findW unreachable target gives range and message, no hang', () => {
    const r = findW(se(), 500);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('out-of-range');
    expect(r.zRange).toBeDefined();
    expect(r.zRange![0]).toBeLessThan(r.zRange![1]);
    expect(r.message).toContain(r.zRange![0].toFixed(1));
    expect(r.message).toContain(r.zRange![1].toFixed(1));
    expect(r.message).not.toContain('NaN');
    expect(r.message).not.toContain('\n');
  });
  it('findS unreachable gives message with max Z', () => {
    const r = findS(diff(strip, 0.125, 0.3), 500);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('out-of-range'); expect(r.zRange).toBeDefined(); }
  });
  it('findS reaches target', () => {
    const r = ok(findS(diff(), 100));
    expect(Math.abs(r.z - 100)).toBeLessThan(0.6);
  });
  it('SE without reference reports no-reference', () => {
    const r = findW({ ...se({ layerId: 'cu0', refAbove: null, refBelow: null }) }, 50);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-reference');
  });
  it('compactAtTarget cu5 diff 100, fmin 0.125', () => {
    const r = ok(compactAtTarget(diff(), 100, 0.125));
    expect(r.W).toBeCloseTo(0.125, 6);
    expect(r.S!).toBeGreaterThan(0.28);
    expect(r.S!).toBeLessThan(0.295);
    expect(Math.abs(r.z - 100)).toBeLessThanOrEqual(0.5);
  });
  it('compactAtTarget F.Cu diff 90, fmin 0.125', () => {
    const r = ok(compactAtTarget(diff(micro, 0.2, 0.25), 90, 0.125));
    expect(Math.abs(r.z - 90)).toBeLessThanOrEqual(0.45);
    expect(r.W).toBeGreaterThanOrEqual(0.125 - 1e-9);
    expect(r.S!).toBeGreaterThanOrEqual(0.125 - 1e-9);
  });
  const finiteOrdered = (r: SynthResult) => {
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.zRange).toBeDefined();
    const [a, b] = r.zRange!;
    expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
    expect(a).toBeLessThan(b);
    expect(r.message).not.toContain('NaN');
  };
  it('compactAtTarget SE below fab minimum', () => {
    const r = compactAtTarget(se(), 80, 0.125);
    finiteOrdered(r);
    if (!r.ok) { expect(r.reason).toBe('below-fab'); expect(r.message).toContain(r.zRange![0].toFixed(1)); }
  });
  it('compactAtTarget diff below fab minimum', () => {
    const r = compactAtTarget(diff(), 150, 0.125);
    finiteOrdered(r);
    if (!r.ok) expect(r.reason).toBe('below-fab');
  });
  it('compactAtTarget diff low target takes the smin branch', () => {
    const r = ok(compactAtTarget(diff(), 40, 0.125));
    expect(r.bound).toBe('smin');
    expect(r.S).toBeCloseTo(0.125, 9);
    expect(r.W).toBeGreaterThan(0.125);
    expect(Math.abs(r.z - 40)).toBeLessThanOrEqual(0.5);
  });
  it('fixed-pitch near pitch - fmin and below-fab W', () => {
    const near = tableCell(diff(), 40, { kind: 'fixed-pitch', pitch: 0.4 }, 0.125, 0.05).main;
    if (near.ok) { expect(near.S!).toBeGreaterThanOrEqual(0.125 - 1e-9); expect(Math.abs(near.W + near.S! - 0.4)).toBeLessThan(1e-9); }
    else expect(['out-of-range', 'below-fab']).toContain(near.reason);
    const narrow = tableCell(diff(), 150, { kind: 'fixed-pitch', pitch: 0.6 }, 0.125, 0.05).main;
    expect(narrow.ok).toBe(false);
    if (!narrow.ok) expect(['below-fab', 'out-of-range']).toContain(narrow.reason);
  });
  it('fixed-gap flags W below fab', () => {
    const r = tableCell(se(), 80, { kind: 'fixed-gap', gap: 0.2 }, 0.125, 0.05).main;
    finiteOrdered(r);
    if (!r.ok) expect(r.reason).toBe('below-fab');
  });
  it('compactWithinTol low target gives a real range', () => {
    const r = compactWithinTol(diff(), { target: 300, tol: 0.05, fmin: 0.125 });
    finiteOrdered(r);
  });
  it('q = 2 too-large error suggests the normal mesh, q = 1 does not', () => {
    forceTooLarge = true;
    try {
      const a = findW({ ...se(), q: 2 }, 50);
      const b = findW({ ...se(), q: 1 }, 50);
      expect(a.ok || a.message).toContain('try the normal mesh');
      expect(b.ok || b.message).not.toContain('try the normal mesh');
    } finally { forceTooLarge = false; }
  });
  it('compactWithinTol cu5 SE 50 +-5 %', () => {
    const r = compactWithinTol(se(), { target: 50, tol: 0.05, fmin: 0.125 });
    const o = ok(r);
    expect(o.W).toBeCloseTo(0.125, 6);
    expect(o.bound).toBe('wmin');
    expect(r.message).toBeTruthy();
  });
  it('compactWithinTol unreachable low gives message', () => {
    const r = compactWithinTol(se(), { target: 90, tol: 0.05, fmin: 0.125 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.zRange).toBeDefined(); expect(r.message).not.toContain('NaN'); }
  });
  it('tableCell fixed-pitch keeps W + S = pitch', () => {
    const { main } = tableCell(diff(), 100, { kind: 'fixed-pitch', pitch: 0.44 }, 0.125, 0.05);
    const m = ok(main);
    expect(Math.abs(m.W + m.S! - 0.44)).toBeLessThan(1e-9);
  });
  it('tableCell fixed-gap and compact-at-target', () => {
    const a = tableCell(diff(), 100, { kind: 'fixed-gap', gap: 0.3 }, 0.125, 0.05);
    expect(ok(a.main).S).toBeCloseTo(0.3, 9);
    const b = tableCell(diff(), 100, { kind: 'compact-at-target' }, 0.125, 0.05);
    expect(ok(b.main).W).toBeCloseTo(0.125, 6);
    expect(b.compact.ok).toBe(true);
  });
  it('roundToStep', () => {
    expect(roundToStep(0.1374, 0.005)).toBeCloseTo(0.135, 9);
  });
});
