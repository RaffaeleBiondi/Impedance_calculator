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
});
