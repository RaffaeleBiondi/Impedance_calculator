// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StoreProvider, useStore, type StoreAction } from '../../src/state/store';
import { defaultAppState } from '../../src/state/types';
import { Sweep } from '../../src/ui/Sweep';

type Deferred = { resolve: (v: unknown[]) => void; reject: (e: unknown) => void };
const h = vi.hoisted(() => ({ batches: [] as { jobs: unknown[]; d: Deferred; cancel: ReturnType<typeof vi.fn> }[] }));

vi.mock('../../src/ui/usePool', () => ({
  usePool: () => ({
    runBatch: (jobs: unknown[]) => {
      let d!: Deferred;
      const promise = new Promise<unknown[]>((resolve, reject) => { d = { resolve, reject }; });
      const cancel = vi.fn(() => d.reject('cancelled'));
      h.batches.push({ jobs, d, cancel });
      return { promise, cancel };
    },
    run: vi.fn(),
    dispose: vi.fn(),
  }),
}));

let dispatch: (a: StoreAction) => void = () => {};
function Grab() { dispatch = useStore().dispatch; return null; }

const ok = (z: number) => ({ ok: true, kind: 'se', r: { Z0: z } });

function mount(type: 'se' | 'diff' = 'se') {
  const s = defaultAppState();
  s.calc.type = type;
  return render(<StoreProvider initial={s}><Grab /><Sweep /></StoreProvider>);
}
async function runAndFinish() {
  fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }));
  const b = h.batches[h.batches.length - 1];
  await act(async () => { b.d.resolve(b.jobs.map((_, i) => ok(40 + i))); });
  expect(screen.getByRole('img', { name: 'Z sweep chart' })).toBeInTheDocument();
}
const chart = () => screen.queryByRole('img', { name: 'Z sweep chart' });

beforeEach(() => { h.batches.length = 0; });

describe('Sweep invalidation', () => {
  it.each([
    ['stackup edit', () => dispatch({ type: 'updateLayer', id: 'd4', patch: { er: 3.5 } })],
    ['layer change', () => dispatch({ type: 'selectLayer', id: 'cu2' })],
    ['reference change', () => dispatch({ type: 'setRefs', above: 'cu1', below: 'cu6' })],
    ['line type change', () => dispatch({ type: 'setCalc', patch: { type: 'diff' } })],
    ['etch change', () => dispatch({ type: 'setEtch', patch: { mode: 'trap' } })],
    ['mesh change', () => dispatch({ type: 'setCalc', patch: { q: 1 } })],
    ['reset to example', () => dispatch({ type: 'resetExample' })],
  ])('drops the curve after a %s', async (_n, act1) => {
    mount();
    await runAndFinish();
    act(() => act1());
    expect(chart()).toBeNull();
  });

  it('keeps the curve when only the swept dimension or the target changes', async () => {
    mount();
    await runAndFinish();
    act(() => dispatch({ type: 'setCalc', patch: { W: 0.2, target: 45 } }));
    expect(chart()).not.toBeNull();
  });

  it('aborts a running sweep when the inputs change', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }));
    act(() => dispatch({ type: 'selectLayer', id: 'cu2' }));
    expect(h.batches[0].cancel).toHaveBeenCalled();
  });

  it('a gap sweep goes back to W, re-based on W, when the line becomes single-ended', () => {
    mount('diff');
    const p = screen.getByLabelText('Sweep parameter') as HTMLSelectElement;
    fireEvent.change(p, { target: { value: 'S' } });
    expect(p.value).toBe('S');
    act(() => dispatch({ type: 'setCalc', patch: { type: 'se' } }));
    expect((screen.getByLabelText('Sweep parameter') as HTMLSelectElement).value).toBe('W');
    const W = defaultAppState().calc.W;
    expect(Number((screen.getByLabelText('Sweep from') as HTMLInputElement).value)).toBeCloseTo(W * 0.5, 6);
    expect(Number((screen.getByLabelText('Sweep to') as HTMLInputElement).value)).toBeCloseTo(W * 2, 6);
  });

  it('shows a failed point\'s error in the display unit (mil), not the worker mm text', async () => {
    const s = defaultAppState();
    s.unit = 'mil';
    render(<StoreProvider initial={s}><Grab /><Sweep /></StoreProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Run sweep' }));
    const b = h.batches[0];
    const bad = { ok: false, error: 'Etched top width W_top = 0.0100 mm is not positive: widen the trace or check the etch rule' };
    await act(async () => { b.d.resolve(b.jobs.map((_, i) => (i === 0 ? bad : ok(50)))); });
    const msg = screen.getByRole('status');
    expect(msg.textContent).toContain('W_top = 0.39 mil is not positive');
    expect(msg.textContent).not.toMatch(/\bmm\b/);
  });
});
