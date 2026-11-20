import type { CopperLayer, DielectricLayer, Stackup } from './stackup';

export function exampleStackup(): Stackup {
  const names = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'In5.Cu', 'In6.Cu', 'In7.Cu', 'In8.Cu', 'B.Cu'];
  const signal = new Set([0, 2, 5, 7, 9]);
  const cus: CopperLayer[] = names.map((name, i) => ({
    kind: 'copper', id: `cu${i}`, name, role: signal.has(i) ? 'signal' : 'plane',
    t: i === 0 || i === 9 ? 0.035 : 0.018,
  }));
  const dd: [DielectricLayer['type'], string, number, number, number][] = [
    ['prepreg', '2116', 0.12, 4.17, 0.019],
    ['core', '7628', 0.2, 4.35, 0.017],
    ['prepreg', '2×1080', 0.14, 3.93, 0.02],
    ['core', '7628', 0.2, 4.35, 0.017],
    ['prepreg', '2×1080', 0.14, 3.93, 0.02],
    ['core', '7628', 0.2, 4.35, 0.017],
    ['prepreg', '2×1080', 0.14, 3.93, 0.02],
    ['core', '7628', 0.2, 4.35, 0.017],
    ['prepreg', '2116', 0.12, 4.17, 0.019],
  ];
  const layers: Stackup['layers'] = [];
  cus.forEach((c, i) => {
    layers.push(c);
    if (i < dd.length) {
      const [type, material, t, er, tand] = dd[i];
      layers.push({ kind: 'dielectric', id: `d${i}`, material, type, t, er, tand });
    }
  });
  return {
    schema: 'lordoftheohms/stackup@1',
    name: 'Example 10-layer (high-Tg FR4)',
    layers,
    maskTop: { t: 0.01, er: 3.3, tand: 0.02 },
    maskBottom: { t: 0.01, er: 3.3, tand: 0.02 },
    etch: { mode: 'rect', rule: { by: 'fraction', value: 0.7 } },
  };
}
