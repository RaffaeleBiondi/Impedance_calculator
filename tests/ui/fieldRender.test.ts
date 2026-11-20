import { describe, it, expect } from 'vitest';
import { sampleField, renderField, type FieldView } from '../../src/ui/fieldRender';
import { analyze, type AnalyzeRequest } from '../../src/solver/engine';
import { exampleStackup } from '../../src/model/example';
import type { FieldData } from '../../src/solver/types';

function grid(): FieldData {
  const xs = new Float64Array([0, 0.5, 2]);
  const ys = new Float64Array([0, 1, 3]);
  const V = new Float64Array(9);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) V[j * 3 + i] = 0.1 * (j * 3 + i) + 0.05;
  return { V, xs, ys };
}

describe('sampleField', () => {
  it('returns the node value at a grid node', () => {
    const f = grid();
    expect(sampleField(f, 0.5, 1, false)).toBeCloseTo(f.V[1 * 3 + 1], 12);
    expect(sampleField(f, 2, 3, false)).toBeCloseTo(f.V[8], 12);
    expect(sampleField(f, 0, 0, false)).toBeCloseTo(f.V[0], 12);
  });

  it('interpolates bilinearly between nodes', () => {
    const f = grid();
    // midway between (0.5,1) and (2,1) at y = 1
    expect(sampleField(f, 1.25, 1, false)).toBeCloseTo((f.V[4] + f.V[5]) / 2, 12);
    // centre of the first cell
    expect(sampleField(f, 0.25, 0.5, false)).toBeCloseTo((f.V[0] + f.V[1] + f.V[3] + f.V[4]) / 4, 12);
  });

  it('mirrors x < 0, negated in odd mode', () => {
    const f = grid();
    expect(sampleField(f, -0.5, 1, false)).toBeCloseTo(f.V[4], 12);
    expect(sampleField(f, -0.5, 1, true)).toBeCloseTo(-f.V[4], 12);
    expect(sampleField(f, 0.5, 1, true)).toBeCloseTo(f.V[4], 12);
  });

  it('clamps outside the grid', () => {
    const f = grid();
    expect(sampleField(f, 5, 1, false)).toBeCloseTo(f.V[5], 12);
    expect(sampleField(f, 0.5, -1, false)).toBeCloseTo(f.V[1], 12);
  });
});

/** Minimal 2D context that records what is drawn. */
function fakeCtx(w: number, h: number) {
  const calls: string[] = [];
  const texts: string[] = [];
  const ctx = {
    canvas: { width: w, height: h },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: 'alphabetic',
    createImageData: (a: number, b: number) => ({ width: a, height: b, data: new Uint8ClampedArray(a * b * 4) }),
    putImageData: () => calls.push('putImageData'),
    fillRect: () => calls.push('fillRect'),
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {}, stroke: () => {}, fill: () => calls.push('fill'),
    setLineDash: () => {}, save: () => {}, restore: () => {},
    measureText: (t: string) => ({ width: t.length * 6 }),
    fillText: (t: string) => { texts.push(t); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

const view = (over: Partial<FieldView> = {}): FieldView => ({
  width: 320, height: 160, dpr: 1,
  line: { W: 0.135 },
  names: { base: 'In6.Cu', cover: 'In4.Cu' },
  colors: { copper: '#b87333', font: 'monospace' },
  ...over,
});

const req = (layerId: string, refAbove: string | null, refBelow: string | null, line: AnalyzeRequest['line']): AnalyzeRequest =>
  ({ stackup: exampleStackup(), sel: { layerId, refAbove, refBelow }, line, q: 1 });

describe('renderField', () => {
  it('draws the field and labels both planes of a stripline', () => {
    const r = analyze(req('cu5', 'cu4', 'cu6', { type: 'se', W: 0.135, etch: false }));
    expect(r.ok).toBe(true);
    const { ctx, calls, texts } = fakeCtx(320, 160);
    renderField(ctx, r, view());
    expect(calls).toContain('putImageData');
    expect(texts.join(' ')).toContain('In4.Cu');
    expect(texts.join(' ')).toContain('In6.Cu');
  });

  it('handles a trapezoidal CPWG pair on the outer layer', () => {
    const s = exampleStackup();
    s.etch.mode = 'trap';
    const r = analyze({ stackup: s, sel: { layerId: 'cu0', refAbove: null, refBelow: 'cu1' }, line: { type: 'diff', W: 0.17, S: 0.27, G: 0.3, etch: true }, q: 1 });
    expect(r.ok).toBe(true);
    const { ctx, calls, texts } = fakeCtx(320, 160);
    renderField(ctx, r, view({ line: { W: 0.17, S: 0.27, G: 0.3, Wtop: r.ok ? r.wtop : undefined }, names: { base: 'In1.Cu', cover: null } }));
    expect(calls).toContain('putImageData');
    // half domain: 8 trapezoid slices x (trace + GND edge), mirrored = 32 rects (a rectangle line gives 4)
    expect(calls.filter((c) => c === 'fillRect').length).toBeGreaterThanOrEqual(32);
    expect(texts.join(' ')).toContain('In1.Cu');
  });
});
