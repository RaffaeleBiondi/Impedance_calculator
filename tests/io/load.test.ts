import { describe, it, expect } from 'vitest';
import { loadInitialState } from '../../src/io/load';
import { storage } from '../../src/io/storage';
import { defaultAppState } from '../../src/state/types';
import { encodeHash } from '../../src/io/urlState';

const memStore = (init: Record<string, unknown> = {}): typeof storage => {
  const m = new Map(Object.entries(init));
  return {
    get: <T,>(k: string) => (m.has(k) ? (m.get(k) as T) : null),
    set: (k: string, v: unknown) => { m.set(k, v); return true; },
    remove: (k: string) => { m.delete(k); },
  };
};

describe('loadInitialState', () => {
  it('uses a valid hash', () => {
    const r = loadInitialState(encodeHash(defaultAppState()), memStore());
    expect(r.source).toBe('hash');
  });
  it('falls back to autosave with a notice on a bad hash', () => {
    const r = loadInitialState('#s=garbage', memStore({ 'lotO.autosave': defaultAppState() }));
    expect(r.source).toBe('storage');
    expect(r.notice).toBeTruthy();
  });
  it('ignores an invalid autosave', () => {
    const r = loadInitialState('', memStore({ 'lotO.autosave': { bogus: 1 } }));
    expect(r.source).toBe('example');
    expect(r.notice).toBeTruthy();
  });
  it('survives storage that throws', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const boom = () => { throw new Error('denied'); };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, value: { getItem: boom, setItem: boom, removeItem: boom },
    });
    try {
      expect(storage.get('x')).toBeNull();
      expect(storage.set('x', 1)).toBe(false);
      expect(() => storage.remove('x')).not.toThrow();
      expect(loadInitialState('', storage).source).toBe('example');
    } finally {
      if (orig) Object.defineProperty(globalThis, 'localStorage', orig); else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('loadInitialState both invalid', () => {
  it('falls to example with a notice', () => {
    const s: any = structuredClone(defaultAppState());
    s.calc.W = 0;
    const r = loadInitialState('#s=garbage', memStore({ 'lotO.autosave': s }));
    expect(r.source).toBe('example');
    expect(r.notice).toBeTruthy();
  });
});

describe('loadInitialState keeps a shared selection only when it is valid', () => {
  it('a valid share link keeps its own layer and references', () => {
    const s = defaultAppState();
    s.calc.layerId = 'cu7'; s.calc.refAbove = 'cu6'; s.calc.refBelow = 'cu8';
    const r = loadInitialState(encodeHash(s), memStore());
    expect([r.state.calc.layerId, r.state.calc.refAbove, r.state.calc.refBelow]).toEqual(['cu7', 'cu6', 'cu8']);
    expect(r.notice).toBeUndefined();
  });
  it('a share link selecting a plane moves to a signal layer with a notice', () => {
    const s = defaultAppState();
    s.calc.layerId = 'cu4'; // In4.Cu is a plane in the example
    const r = loadInitialState(encodeHash(s), memStore());
    expect(r.source).toBe('hash');
    const sel = r.state.stackup.layers.find((l) => l.id === r.state.calc.layerId)!;
    expect(sel.kind === 'copper' && sel.role !== 'plane').toBe(true);
    expect(r.notice).toMatch(/plane/);
  });
});
