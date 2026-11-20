import { describe, it, expect } from 'vitest';
import { parseStackupJson, serializeStackup } from '../../src/io/json';
import { exampleStackup } from '../../src/model/example';

describe('stackup JSON', () => {
  it('round-trips the example', () => {
    const s = exampleStackup();
    const r = parseStackupJson(serializeStackup(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stackup).toEqual(s);
  });
  it('rejects wrong schema', () => {
    const o = JSON.parse(serializeStackup(exampleStackup()));
    o.schema = 'nope@9';
    const r = parseStackupJson(JSON.stringify(o));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/schema/i);
  });
  it('names the layer with a missing er', () => {
    const o = JSON.parse(serializeStackup(exampleStackup()));
    delete o.layers.find((l: { kind: string }) => l.kind === 'dielectric').er;
    const r = parseStackupJson(JSON.stringify(o));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('d0');
  });
  it('reports garbage text without throwing', () => {
    expect(parseStackupJson('{{').ok).toBe(false);
    expect(parseStackupJson('null').ok).toBe(false);
  });
});
