import { describe, expect, it } from 'vitest';
import { exampleStackup } from '../../src/model/example';
import { handleJob } from '../../src/solver/protocol';

describe('handleJob', () => {
  it('analyze returns Z0 for the In5 SE example', () => {
    const res = handleJob({
      op: 'analyze',
      req: {
        stackup: exampleStackup(), sel: { layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' },
        line: { type: 'se', W: 0.135, etch: false }, q: 2,
      },
    }) as { ok: boolean; kind: string; r: { Z0: number } };
    expect(res.ok).toBe(true);
    expect(Math.abs(res.r.Z0 - 50.03)).toBeLessThan(0.02);
  });

  it('findW returns a width that hits the target', () => {
    const res = handleJob({
      op: 'findW', target: 50,
      req: {
        stackup: exampleStackup(), sel: { layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' },
        line: { type: 'se', W: 0.1, etch: false }, q: 2,
      },
    }) as { ok: boolean; W: number; z: number };
    expect(res.ok).toBe(true);
    expect(Math.abs(res.z - 50)).toBeLessThan(0.1);
    expect(Math.abs(res.W - 0.135)).toBeLessThan(0.01);
  });
});
