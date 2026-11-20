// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import App from '../../src/ui/App';

// jsdom has no Worker: the shared solver pool is replaced by an inert one whose jobs never settle.
vi.mock('../../src/ui/usePool', () => {
  const pending = () => ({ promise: new Promise<never>(() => {}), cancel: () => {} });
  const pool = { run: pending, runBatch: pending, dispose: () => {} };
  return { usePool: () => pool };
});

const fx = readFileSync('tests/fixtures/kicad7-4layer.kicad_pcb', 'utf8').replace('(1 "In1.Cu" power)', '(1 "In1.Cu" signal)');
const role = (name: string) => (screen.getByLabelText(`Role of ${name}`) as HTMLSelectElement).value;

async function openAndPick(name: string, text: string) {
  fireEvent.click(screen.getAllByRole('button', { name: /Import KiCad/ })[0]);
  const input = screen.getByLabelText('Stackup file');
  fireEvent.change(input, { target: { files: [new File([text], name)] } });
}

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });

describe('KiCad import flow', () => {
  it('does not apply the stackup until "Use this stackup" is clicked', async () => {
    render(<App />);
    expect(screen.getByLabelText('Name of cu0')).toHaveValue('F.Cu');
    const before = screen.getAllByLabelText(/^Name of cu/).length;
    await openAndPick('b.kicad_pcb', fx);
    await screen.findByLabelText('Role of In1.Cu');
    expect(screen.getAllByLabelText(/^Name of cu/).length).toBe(before);
    expect(screen.queryByLabelText('Name of In1.Cu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use this stackup' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByDisplayValue('In1.Cu').length).toBeGreaterThan(0);
  });

  it('applies a role change made in the review', async () => {
    render(<App />);
    await openAndPick('b.kicad_pcb', fx);
    await screen.findByLabelText('Role of In1.Cu');
    expect(role('In1.Cu')).toBe('signal');
    fireEvent.change(screen.getByLabelText('Role of In1.Cu'), { target: { value: 'plane' } });
    expect(role('In1.Cu')).toBe('plane');
    fireEvent.click(screen.getByRole('button', { name: 'Use this stackup' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const sel = screen.getAllByRole('combobox').find((s) => (s as HTMLSelectElement).value === 'plane');
    expect(sel).toBeDefined();
  });

  it('shows the error list for a bad JSON import', async () => {
    render(<App />);
    await openAndPick('bad.json', '{"schema":"nope"}');
    const list = await screen.findByLabelText('Import errors');
    expect(list.querySelectorAll('li').length).toBeGreaterThan(0);
  });

  it('shows an error for a non-KiCad file', async () => {
    render(<App />);
    await openAndPick('x.kicad_pcb', '(foo)');
    expect((await screen.findByLabelText('Import errors')).textContent).toMatch(/layers/);
  });
});

describe('theme toggle', () => {
  it('sets, persists and clears data-theme', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('lotO.theme')!)).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('lotO.theme')!)).toBe('auto');
  });
});

describe('assumptions', () => {
  it('renders notes and the empty validation state', () => {
    render(<App />);
    expect(screen.getByText('Validation results will appear here.')).toBeInTheDocument();
    expect(screen.getByText(/Solver method/)).toBeInTheDocument();
  });
});
