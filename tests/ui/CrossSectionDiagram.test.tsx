// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrossSectionDiagram } from '../../src/ui/CrossSectionDiagram';
import { buildCrossSection } from '../../src/model/crossSection';
import { exampleStackup } from '../../src/model/example';

const xsOf = (layerId: string, a: string | null, b: string | null) => {
  const r = buildCrossSection(exampleStackup(), { layerId, refAbove: a, refBelow: b });
  if (!r.ok) throw new Error(r.error);
  return r.xs;
};

describe('CrossSectionDiagram', () => {
  it('In5.Cu stripline: title, slab label and plane names', () => {
    render(<CrossSectionDiagram xs={xsOf('cu5', 'cu4', 'cu6')} line={{ W: 0.135 }} names={{ above: 'In4.Cu', below: 'In6.Cu' }} unit="mm" />);
    expect(screen.getByText('Asymmetric stripline')).toBeInTheDocument();
    expect(screen.getAllByText(/7628 · 0\.200 mm · εr 4\.35/).length).toBe(1);
    expect(screen.getByText('In4.Cu')).toBeInTheDocument();
    expect(screen.getByText('In6.Cu')).toBeInTheDocument();
    expect(screen.getByText(/not to scale/i)).toBeInTheDocument();
  });

  it('F.Cu microstrip: title, slab label, air and mask', () => {
    render(<CrossSectionDiagram xs={xsOf('cu0', null, 'cu1')} line={{ W: 0.2 }} names={{ above: null, below: 'In1.Cu' }} unit="mm" />);
    expect(screen.getByText('Microstrip')).toBeInTheDocument();
    expect(screen.getAllByText(/2116 · 0\.120 mm · εr 4\.17/).length).toBe(1);
    expect(screen.getByText(/air/i)).toBeInTheDocument();
    expect(screen.getByText(/mask/i)).toBeInTheDocument();
  });

  it('diff CPWG pair with skipped copper: title, dimensions and cut-out', () => {
    render(<CrossSectionDiagram xs={xsOf('cu0', null, 'cu4')} line={{ W: 0.17, S: 0.27, G: 0.3, Wtop: 0.145 }} names={{ above: null, below: 'In4.Cu' }} unit="mm" />);
    expect(screen.getByText('CPWG, edge-coupled pair')).toBeInTheDocument();
    expect(screen.getAllByText(/cut out/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^W 0\.170/)).toBeInTheDocument();
    expect(screen.getByText(/^S 0\.270/)).toBeInTheDocument();
    expect(screen.getAllByText(/^G 0\.300/).length).toBeGreaterThan(0);
  });

  it('open side shows "open" for an inner layer with one reference', () => {
    render(<CrossSectionDiagram xs={xsOf('cu5', null, 'cu6')} line={{ W: 0.135 }} names={{ above: null, below: 'In6.Cu' }} unit="mm" />);
    expect(screen.getByText('Embedded microstrip')).toBeInTheDocument();
    expect(screen.getByText(/open/i)).toBeInTheDocument();
  });

  it('summarises the open sides of a no-reference pair in one band each', () => {
    const { container } = render(<CrossSectionDiagram xs={xsOf('cu5', null, null)} line={{ W: 0.125, S: 0.3 }} names={{ above: null, below: null }} unit="mm" />);
    expect(screen.getAllByText(/layers to surface/).length).toBe(2);
    expect(screen.getAllByText(/cut out/).length).toBeLessThanOrEqual(2);
    const h = Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[3]);
    expect(h).toBeLessThan(400);
  });
});
