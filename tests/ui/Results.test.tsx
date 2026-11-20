// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Results, chipClass } from '../../src/ui/Results';
import { analyze, type AnalyzeResult } from '../../src/solver/engine';
import { exampleStackup } from '../../src/model/example';
import { defaultAppState, type CalcState } from '../../src/state/types';

beforeAll(() => {
  // jsdom has no canvas: the field plot must cope with a null context.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const seRes: AnalyzeResult = analyze({
  stackup: exampleStackup(), sel: { layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' },
  line: { type: 'se', W: 0.135, etch: false }, q: 1, freqGHz: 1,
});
const oddRes: AnalyzeResult = analyze({
  stackup: exampleStackup(), sel: { layerId: 'cu5', refAbove: null, refBelow: null },
  line: { type: 'diff', W: 0.125, S: 0.3, etch: false }, q: 1, freqGHz: 1,
});

const calc = (over: Partial<CalcState> = {}): CalcState => ({ ...defaultAppState().calc, ...over });
const names = { layer: 'In5.Cu', above: 'In4.Cu', below: 'In6.Cu' };

function show(result: AnalyzeResult, c: CalcState) {
  const line = { W: c.W, S: c.type === 'diff' ? c.S : undefined, G: c.cpw ? c.G : null };
  return render(<Results result={result} line={line} calc={c} unit="mm" names={names} />);
}

describe('Results', () => {
  it('fixtures solved', () => {
    expect(seRes.ok).toBe(true);
    expect(oddRes.ok && oddRes.kind === 'diff' && oddRes.oddOnly).toBe(true);
  });

  it('shows no Delay or Skew rows without lengths', () => {
    show(seRes, calc({ L1: null, L2: null }));
    expect(screen.queryByText('Delay')).toBeNull();
    expect(screen.queryByText('Skew')).toBeNull();
    expect(screen.getByText('Z0')).toBeInTheDocument();
  });

  it('shows Delay with L1 and Skew with L1 and L2', () => {
    const { unmount } = show(seRes, calc({ L1: 100, L2: null }));
    expect(screen.getByText('Delay')).toBeInTheDocument();
    expect(screen.queryByText('Skew')).toBeNull();
    unmount();
    show(seRes, calc({ L1: 100, L2: 90 }));
    expect(screen.getByText('Delay')).toBeInTheDocument();
    expect(screen.getByText('Skew')).toBeInTheDocument();
  });

  it('hides Zeven/Zcm for an odd-only pair and explains why', () => {
    show(oddRes, calc({ type: 'diff', W: 0.125, S: 0.3, target: 100, refAbove: null, refBelow: null }));
    expect(screen.getByText('Zdiff')).toBeInTheDocument();
    expect(screen.getByText('Zodd')).toBeInTheDocument();
    expect(screen.queryByText('Zeven')).toBeNull();
    expect(screen.queryByText('Zcm')).toBeNull();
    expect(screen.getByText(/odd mode only/i)).toBeInTheDocument();
    expect(screen.getByText(/even mode has no return path/i)).toBeInTheDocument();
  });

  it('colours the deviation chip as in the original (ok / warn / bad)', () => {
    expect(chipClass(0.04, 5)).toBe('ok');
    expect(chipClass(-0.05, 5)).toBe('ok');
    expect(chipClass(0.07, 5)).toBe('warn');
    expect(chipClass(-0.1, 5)).toBe('warn');
    expect(chipClass(0.11, 5)).toBe('bad');
    const z = seRes.ok && seRes.kind === 'se' ? seRes.r.Z0 : NaN;
    const chip = (t: number) => {
      const { unmount, container } = show(seRes, calc({ target: t, tol: 5 }));
      const c = container.querySelector('.devchip') as HTMLElement;
      const cls = c.className;
      unmount();
      return cls;
    };
    expect(chip(z)).toContain('ok');
    expect(chip(z / 1.07)).toContain('warn');
    expect(chip(z / 1.2)).toContain('bad');
  });

  it('shows loss and fab-minimum chips', () => {
    show(seRes, calc({ W: 0.135, fmin: 0.15 }));
    expect(screen.getByText(/dB\/m/)).toBeInTheDocument();
    expect(screen.getByText(/W < 0\.150/)).toBeInTheDocument();
  });

  it('shows the topology label', () => {
    show(seRes, calc());
    expect(screen.getAllByText('Asymmetric stripline').length).toBeGreaterThan(0);
  });
});
