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

  it('findW with fmin reports a below-fab result with the Z range for W >= fmin', () => {
    const req = {
      stackup: exampleStackup(), sel: { layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' },
      line: { type: 'se' as const, W: 0.1, etch: false }, q: 1 as const,
    };
    const res = handleJob({ op: 'findW', target: 60, fmin: 0.125, req }) as { ok: boolean; reason?: string; zRange?: [number, number] };
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('below-fab');
    expect(res.zRange![0]).toBeLessThan(res.zRange![1]);
    expect(res.zRange![1]).toBeLessThan(60);
    const ok = handleJob({ op: 'findW', target: 50, fmin: 0.125, req }) as { ok: boolean };
    expect(ok.ok).toBe(true);
    const legacy = handleJob({ op: 'findW', target: 60, req }) as { ok: boolean };
    expect(legacy.ok).toBe(true); // without fmin: unchanged behaviour
  });

  it('findS with fmin reports a below-fab gap with the Z range for S >= fmin', () => {
    const req = {
      stackup: exampleStackup(), sel: { layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' },
      line: { type: 'diff' as const, W: 0.2, S: 0.2, etch: false }, q: 1 as const,
    };
    const free = handleJob({ op: 'findS', target: 70, req }) as { ok: boolean; S?: number };
    expect(free.ok && free.S! < 0.15).toBe(true);
    const res = handleJob({ op: 'findS', target: 70, fmin: 0.15, req }) as { ok: boolean; reason?: string; zRange?: [number, number] };
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('below-fab');
    expect(res.zRange![0]).toBeGreaterThan(70);
  });
});
