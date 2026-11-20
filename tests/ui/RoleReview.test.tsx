// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import App from '../../src/ui/App';
import rows from '../../src/validation.json';

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

  it('shows stackup validation errors in the review step', async () => {
    render(<App />);
    await openAndPick('s.kicad_pcb', readFileSync('tests/fixtures/kicad9-4layer-sublayers.kicad_pcb', 'utf8'));
    const list = await screen.findByLabelText('Stackup errors');
    expect(list.textContent).toMatch(/er must be a finite number/);
    expect(screen.getByRole('button', { name: 'Use this stackup' })).toBeEnabled();
  });

  it('shows an error for a non-KiCad file', async () => {
    render(<App />);
    await openAndPick('x.kicad_pcb', '(foo)');
    expect((await screen.findByLabelText('Import errors')).textContent).toMatch(/layers/);
  });
});

describe('whole-stackup replacement (fix wave B4, C14)', () => {
  const six = readFileSync('tests/fixtures/kicad8-6layer.kicad_pcb', 'utf8');
  const shown = (label: string) => {
    const el = screen.getByLabelText(label) as HTMLSelectElement;
    return el.value === '' ? '' : el.options[el.selectedIndex].text;
  };

  it('importing the 6-layer board with In3.Cu as plane selects F.Cu with its default reference, not B.Cu', async () => {
    render(<App />);
    expect(shown('Signal layer')).toBe('In5.Cu');
    await openAndPick('six.kicad_pcb', six);
    await screen.findByLabelText('Role of In3.Cu');
    fireEvent.change(screen.getByLabelText('Role of In3.Cu'), { target: { value: 'plane' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this stackup' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shown('Signal layer')).toBe('F.Cu');
    expect(shown('Reference above')).toBe('');
    expect(shown('Reference below')).toBe('In1.Cu'); // In1.Cu is "power" -> plane
    expect(screen.getByRole('status').textContent).toMatch(/F\.Cu/);
  });

  it('a successful import clears an earlier "Import failed" message in the editor', async () => {
    const { container } = render(<App />);
    const json = container.querySelector('input[type=file][accept="application/json,.json"]') as HTMLInputElement;
    fireEvent.change(json, { target: { files: [new File(['{"schema":"nope"}'], 'bad.json')] } });
    expect(await screen.findByText(/^Import failed/)).toBeInTheDocument();
    await openAndPick('six.kicad_pcb', six);
    await screen.findByLabelText('Role of In3.Cu');
    fireEvent.click(screen.getByRole('button', { name: 'Use this stackup' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/^Import failed/)).toBeNull();
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
  it('renders notes and the generated validation table (src/validation.json)', () => {
    render(<App />);
    expect(screen.queryByText('Validation results will appear here.')).toBeNull();
    const table = screen.getByRole('table', { name: 'Validation results' });
    expect(table.querySelectorAll('tbody tr').length).toBe(rows.length);
    for (const s of ['Pass', 'Deviation recorded', 'Not validated']) expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    expect(screen.getByText(/Solver method/)).toBeInTheDocument();
  });
});
