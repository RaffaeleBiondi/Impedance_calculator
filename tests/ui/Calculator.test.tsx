// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Job } from '../../src/solver/protocol';

type Pending = { job: Job; resolve: (v: unknown) => void; reject: (e: unknown) => void; cancel: ReturnType<typeof vi.fn> };
const runs: Pending[] = [];
const fakePool = {
  run: vi.fn((job: Job) => {
    let resolve!: (v: unknown) => void, reject!: (e: unknown) => void;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const p: Pending = { job, resolve, reject, cancel: vi.fn(() => reject('cancelled')) };
    runs.push(p);
    return { promise, cancel: p.cancel };
  }),
  runBatch: vi.fn(),
  dispose: vi.fn(),
};
vi.mock('../../src/ui/usePool', () => ({ usePool: () => fakePool }));

import { StoreProvider } from '../../src/state/store';
import { defaultAppState } from '../../src/state/types';
import { Calculator, DEBOUNCE_MS } from '../../src/ui/Calculator';
import { analyze } from '../../src/solver/engine';

beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never; });
beforeEach(() => { runs.length = 0; fakePool.run.mockClear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const mount = () => render(<StoreProvider initial={defaultAppState()}><Calculator /></StoreProvider>);
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('Calculator', () => {
  it('debounces the analysis and builds the request from state', () => {
    mount();
    tick(DEBOUNCE_MS - 10);
    expect(runs.length).toBe(0);
    tick(20);
    expect(runs.length).toBe(1);
    const j = runs[0].job;
    expect(j.op).toBe('analyze');
    if (j.op !== 'analyze') return;
    expect(j.req.sel).toEqual({ layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' });
    expect(j.req.line).toEqual({ type: 'se', W: 0.135, S: undefined, G: null, etch: false });
    expect(j.req.q).toBe(2);
  });

  it('supersedes a stale job: rapid edits run once, and the in-flight job is cancelled', () => {
    mount();
    tick(DEBOUNCE_MS + 1);
    expect(runs.length).toBe(1);
    const w = screen.getByLabelText('Width W');
    fireEvent.change(w, { target: { value: '0.14' } });
    tick(50);
    fireEvent.change(w, { target: { value: '0.15' } });
    tick(DEBOUNCE_MS + 1);
    expect(runs.length).toBe(2);
    expect(runs[0].cancel).toHaveBeenCalled();
    const j = runs[1].job;
    expect(j.op === 'analyze' && j.req.line.W).toBe(0.15);
  });

  it('shows the result of the latest job', async () => {
    mount();
    tick(DEBOUNCE_MS + 1);
    const r = analyze({ ...((runs[0].job as Extract<Job, { op: 'analyze' }>).req), q: 1 });
    await act(async () => { runs[0].resolve(r); });
    expect(screen.getByText('Z0')).toBeInTheDocument();
    expect(screen.getAllByText('Asymmetric stripline').length).toBeGreaterThan(0);
  });

  it('button visibility follows the original page', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Find W' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find gap' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Round' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diff' }));
    expect(screen.getByRole('button', { name: 'Find gap' })).toBeInTheDocument();
    expect(screen.getByLabelText('Target impedance')).toHaveValue('100');
    fireEvent.click(screen.getByLabelText(/Most compact/));
    expect(screen.queryByRole('button', { name: 'Find W' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Find gap' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Round' })).toBeNull();
    expect(screen.getByLabelText('Width W')).toBeDisabled();
  });

  it('compact mode sends a compact job and writing W back does not re-run it', async () => {
    mount();
    fireEvent.click(screen.getByLabelText(/Most compact/));
    tick(DEBOUNCE_MS + 1);
    const last = runs[runs.length - 1];
    expect(last.job.op).toBe('compact');
    if (last.job.op !== 'compact') return;
    expect(last.job.tol).toBeCloseTo(0.05, 12);
    const res = analyze({ ...last.job.req, line: { ...last.job.req.line, W: 0.125 }, q: 1 });
    const n = runs.length;
    await act(async () => { last.resolve({ ok: true, W: 0.125, z: 51.8, result: res, bound: 'wmin', message: 'Narrowest trace within +/-5 %: W 0.125 mm.' }); });
    tick(DEBOUNCE_MS + 1);
    expect(runs.length).toBe(n);
    expect(screen.getByLabelText('Width W')).toHaveValue('0.125');
    expect(screen.getByText(/Narrowest trace/)).toBeInTheDocument();
  });

  it('Find W writes W and reports a one-line message; a failure shows the message and a Why? detail', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Find W' }));
    const j = runs[runs.length - 1];
    expect(j.job.op).toBe('findW');
    const res = analyze({ ...(j.job as Extract<Job, { op: 'findW' }>).req, line: { type: 'se', W: 0.1352, etch: false }, q: 1 });
    await act(async () => { j.resolve({ ok: true, W: 0.13519, z: 50, result: res }); });
    expect(screen.getByLabelText('Width W')).toHaveValue('0.1352');
    expect(screen.getByText(/W 0\.1352 mm for 50 Ω/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Find W' }));
    const k = runs[runs.length - 1];
    await act(async () => { k.resolve({ ok: false, reason: 'out-of-range', message: 'Out of reach', detail: 'Longer reason' }); });
    expect(screen.getByText('Out of reach')).toBeInTheDocument();
    expect(screen.getByText('Why?')).toBeInTheDocument();
    expect(screen.getByText('Longer reason')).toBeInTheDocument();
  });

  it('L1 can be cleared back to none', () => {
    mount();
    const l1 = screen.getByLabelText('Length L1');
    fireEvent.change(l1, { target: { value: '25' } });
    expect(l1).toHaveValue('25');
    fireEvent.change(l1, { target: { value: '' } });
    expect(l1).toHaveValue('');
  });
});
