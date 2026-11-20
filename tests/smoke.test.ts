import { describe, expect, it } from 'vitest';
import { legacy } from './helpers/legacy';

describe('legacy golden solver', () => {
  it('stripline reference case', () => {
    const r = legacy.SE(
      { type: 'strip', T: 0.018, H1: 0.2, er1: 4.35, H2: 0.14, er2: 3.93, erf: 3.93, G: null, W: 0.135 },
      2,
    );
    expect(Math.abs(r.Z0 - 50.03)).toBeLessThan(0.005);
  });

  it('microstrip reference case', () => {
    const r = legacy.SE(
      { type: 'micro', T: 0.035, H: 0.12, er: 4.17, tm: 0.01, erm: 3.3, G: null, W: 0.2 },
      2,
    );
    expect(Math.abs(r.Z0 - 50.36)).toBeLessThan(0.005);
  });
});
