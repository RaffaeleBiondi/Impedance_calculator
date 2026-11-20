// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../src/ui/App';

describe('App shell', () => {
  it('renders the example stackup and the three slots', () => {
    render(<App />);
    expect(screen.getByLabelText('Stackup editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Calculator')).toBeInTheDocument();
    expect(screen.getByLabelText('Sweep and width table')).toBeInTheDocument();
    expect(screen.getByLabelText('Assumptions and validation')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of cu0')).toHaveValue('F.Cu');
  });
});

describe('header logo', () => {
  it('renders the logo image', () => {
    render(<App />);
    expect(screen.getByRole('img', { name: 'LordOfTheOhms logo' })).toBeInTheDocument();
  });
});

describe('row inputs keep focus', () => {
  it('multi-character typing in name and thickness survives', () => {
    render(<App />);
    const name = screen.getByLabelText('Name of cu0') as HTMLInputElement;
    name.focus();
    for (const v of ['F.CuX', 'F.CuXY']) {
      fireEvent.change(screen.getByLabelText('Name of cu0'), { target: { value: v } });
      expect(screen.getByLabelText('Name of cu0')).toHaveValue(v);
    }
    expect(screen.getByLabelText('Name of cu0')).toBe(name);
    const th = screen.getByLabelText('Thickness of d0');
    for (const v of ['0', '0.0', '0.05']) fireEvent.change(screen.getByLabelText('Thickness of d0'), { target: { value: v } });
    expect(screen.getByLabelText('Thickness of d0')).toHaveValue('0.05');
    expect(screen.getByLabelText('Thickness of d0')).toBe(th);
  });
});

describe('assumptions toggle', () => {
  it('is closed by default and opens on summary click', () => {
    render(<App />);
    const d = screen.getByLabelText('Assumptions and validation') as HTMLDetailsElement;
    expect(d.tagName).toBe('DETAILS');
    expect(d.open).toBe(false);
    fireEvent.click(screen.getByText('Assumptions & validation'));
    expect(d.open).toBe(true);
  });
});
