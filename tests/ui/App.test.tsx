// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
