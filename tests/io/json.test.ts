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

describe('malformed layers', () => {
  const run = (mut: (o: any) => void) => {
    const o = JSON.parse(serializeStackup(exampleStackup()));
    mut(o);
    return parseStackupJson(JSON.stringify(o));
  };
  const cu = (o: any) => o.layers.find((l: any) => l.kind === 'copper');
  const di = (o: any) => o.layers.find((l: any) => l.kind === 'dielectric');
  it.each([
    ['missing role', (o: any) => { delete cu(o).role; }],
    ['bad role', (o: any) => { cu(o).role = 'ground'; }],
    ['bad dielectric type', (o: any) => { di(o).type = 'foil'; }],
    ['missing dielectric type', (o: any) => { delete di(o).type; }],
    ['etchOverride value 0', (o: any) => { cu(o).etchOverride = { by: 'fraction', value: 0 }; }],
    ['etchOverride NaN-ish', (o: any) => { cu(o).etchOverride = { by: 'factor', value: null }; }],
    ['etchOverride bad by', (o: any) => { cu(o).etchOverride = { by: 'x', value: 1 }; }],
    ['non-string name', (o: any) => { cu(o).name = 5; }],
    ['non-string material', (o: any) => { di(o).material = 5; }],
    ['maskTop not object', (o: any) => { o.maskTop = 3; }],
    ['mask missing t', (o: any) => { delete o.maskTop.t; }],
    ['etch rule value negative', (o: any) => { o.etch.rule.value = -1; }],
  ])('rejects %s', (_n, m) => { expect(run(m).ok).toBe(false); });
});
