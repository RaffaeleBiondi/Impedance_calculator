// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StoreProvider } from '../../src/state/store';
import { defaultAppState } from '../../src/state/types';
import { WidthTable } from '../../src/ui/WidthTable';

type Deferred = { resolve: (v: unknown[]) => void; reject: (e: unknown) => void };
const h = vi.hoisted(() => ({ batches: [] as { jobs: unknown[]; d: Deferred; cancel: ReturnType<typeof vi.fn> }[] }));

vi.mock('../../src/ui/usePool', () => ({
  usePool: () => ({
    runBatch: (jobs: unknown[], onProgress?: (d: number, t: number) => void) => {
      let d!: Deferred;
      const promise = new Promise<unknown[]>((resolve, reject) => { d = { resolve, reject }; });
      const cancel = vi.fn(() => d.reject('cancelled'));
      h.batches.push({ jobs, d, cancel });
      onProgress?.(0, jobs.length);
      return { promise, cancel };
    },
    run: vi.fn(),
    dispose: vi.fn(),
  }),
}));

const cell = (W: number, S?: number, z = 50) => ({ main: { ok: true, W, S, z }, compact: { ok: true, W: W - 0.01, S, z: 52 } });

function mount() {
  return render(<StoreProvider initial={defaultAppState()}><WidthTable /></StoreProvider>);
}
async function finish(n = 0) {
  const b = h.batches[n];
  await act(async () => { b.d.resolve(b.jobs.map(() => cell(0.135, undefined))); });
}

beforeEach(() => { h.batches.length = 0; });

describe('WidthTable', () => {
  it('lists the three pre-loaded classes with the compact-at-target rule', () => {
    mount();
    for (const n of ['SE 50', 'DIFF 100', 'DIFF 90']) expect(screen.getByDisplayValue(n)).toBeInTheDocument();
    const rules = screen.getAllByLabelText(/^Rule of/) as HTMLSelectElement[];
    expect(rules).toHaveLength(3);
    for (const r of rules) expect(r.options[r.selectedIndex].text).toBe('Compact at target');
  });

  it('shows CSV only after the batch resolves', async () => {
    mount();
    expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run table' }));
    expect(h.batches).toHaveLength(1);
    expect((h.batches[0].jobs[0] as { op: string }).op).toBe('tableCell');
    expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull();
    await finish();
    expect(await screen.findByRole('button', { name: /CSV/ })).toBeInTheDocument();
  });

  it('removing a class clears the results and hides CSV', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Run table' }));
    await finish();
    await screen.findByRole('button', { name: /CSV/ });
    fireEvent.click(screen.getByRole('button', { name: 'Remove SE 50' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull());
  });

  it('changing a layer clears the results and hides CSV', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Run table' }));
    await finish();
    await screen.findByRole('button', { name: /CSV/ });
    fireEvent.click(screen.getByLabelText('Include F.Cu'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull());
  });

  it('cancel calls cancel() and leaves the table empty', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Run table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.batches[0].cancel).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run table' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull();
    expect(screen.queryByTestId('width-grid')).toBeNull();
  });
});
