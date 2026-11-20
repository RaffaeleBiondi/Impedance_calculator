// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LenInput } from '../../src/ui/LenInput';

describe('LenInput', () => {
  it('switching unit never calls onChangeMm and re-renders the display', () => {
    const f = vi.fn();
    const { rerender } = render(<LenInput valueMm={0.135} unit="mm" onChangeMm={f} aria-label="w" />);
    expect(screen.getByLabelText('w')).toHaveValue('0.135');
    rerender(<LenInput valueMm={0.135} unit="mil" onChangeMm={f} aria-label="w" />);
    expect(screen.getByLabelText('w')).toHaveValue('5.315');
    rerender(<LenInput valueMm={0.135} unit="um" onChangeMm={f} aria-label="w" />);
    expect(screen.getByLabelText('w')).toHaveValue('135');
    expect(f).not.toHaveBeenCalled();
  });
  it('typing 5.315 in mil emits 5.315*0.0254 mm', () => {
    const f = vi.fn();
    render(<LenInput valueMm={1} unit="mil" onChangeMm={f} aria-label="w" />);
    fireEvent.change(screen.getByLabelText('w'), { target: { value: '5.315' } });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBeCloseTo(0.135001, 6);
  });
  it('does not emit on garbage', () => {
    const f = vi.fn();
    render(<LenInput valueMm={1} unit="mm" onChangeMm={f} aria-label="w" />);
    fireEvent.change(screen.getByLabelText('w'), { target: { value: 'abc' } });
    expect(f).not.toHaveBeenCalled();
  });
});
