// Solver timing through analyze(), with the legacy JS on the same cases for comparison.
// Spec §6.3 budget (Node, original JS): SE normal ≈ 35 ms, SE fine ≈ 130–180 ms, pair fine ≈ 0.5 s.
// Run: npm run bench
import { createRequire } from 'node:module';
import { exampleStackup } from '../src/model/example';
import { analyze, type AnalyzeRequest } from '../src/solver/engine';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacy: any = require('../tests/legacy/zsolver.legacy.cjs');

const ex = exampleStackup();
const cu5 = { layerId: 'cu5', refAbove: 'cu4', refBelow: 'cu6' };
const fcu = { layerId: 'cu0', refAbove: null, refBelow: 'cu1' };
const gIn5 = { type: 'strip', T: 0.018, H1: 0.2, er1: 4.35, H2: 0.14, er2: 3.93, erf: 3.93, G: null, W: 0.135 };
const gF = { type: 'micro', T: 0.035, H: 0.12, er: 4.17, tm: 0.01, erm: 3.3, G: null, W: 0.17, S: 0.27 };

const cases: { name: string; req: AnalyzeRequest; old: () => unknown }[] = [
  { name: 'cu5 SE 0.135, q 1 (normal)', req: { stackup: ex, sel: cu5, line: { type: 'se', W: 0.135, etch: false }, q: 1 }, old: () => legacy.SE(gIn5, 1) },
  { name: 'cu5 SE 0.135, q 2 (fine)', req: { stackup: ex, sel: cu5, line: { type: 'se', W: 0.135, etch: false }, q: 2 }, old: () => legacy.SE(gIn5, 2) },
  { name: 'F.Cu diff 0.17/0.27, q 2 (fine)', req: { stackup: ex, sel: fcu, line: { type: 'diff', W: 0.17, S: 0.27, etch: false }, q: 2 }, old: () => legacy.DIFF(gF, 2) },
  { name: 'F.Cu diff 0.17/0.27, q 2, trapezoid', req: { stackup: ex, sel: fcu, line: { type: 'diff', W: 0.17, S: 0.27, etch: true }, q: 2 }, old: () => legacy.DIFF(gF, 2) },
];

function median(fn: () => unknown, n: number): number {
  fn(); // warm-up
  const t: number[] = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  return t[Math.floor(n / 2)];
}

for (const c of cases) {
  const r = analyze(c.req);
  if (!r.ok) throw new Error(r.error);
  const tNew = median(() => analyze(c.req), 5);
  const tOld = median(c.old, 5);
  console.log(`${c.name.padEnd(38)} new ${tNew.toFixed(0).padStart(5)} ms   legacy ${tOld.toFixed(0).padStart(5)} ms   ratio ${(tNew / tOld).toFixed(2)}   nodes ${r.r.nodes}`);
}
