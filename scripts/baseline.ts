// V1 re-baseline: the five regression cases on the example stackup with the generalised builder.
// Prints Z = rich(2,4) (what analyze returns at q 2) and the convergence check rich(2,4) vs rich(4,8).
// Run: npx tsx scripts/baseline.ts
import { exampleStackup } from '../src/model/example';
import { buildCrossSection } from '../src/model/crossSection';
import { makeBuild, richOrder } from '../src/solver/engine';
import { richDiff, richSE } from '../src/solver/line';

const ex = exampleStackup();
const cases = [
  { name: 'In5 SE 0.135', layerId: 'cu5', refs: ['cu4', 'cu6'], W: 0.135, legacy: 50.03 },
  { name: 'In5 diff 0.125/0.315', layerId: 'cu5', refs: ['cu4', 'cu6'], W: 0.125, S: 0.315, legacy: 100.79 },
  { name: 'F.Cu SE 0.20', layerId: 'cu0', refs: [null, 'cu1'], W: 0.2, legacy: 50.36 },
  { name: 'F.Cu diff 0.17/0.27', layerId: 'cu0', refs: [null, 'cu1'], W: 0.17, S: 0.27, legacy: 100.78 },
  { name: 'F.Cu diff 0.21/0.25', layerId: 'cu0', refs: [null, 'cu1'], W: 0.21, S: 0.25, legacy: 90.18 },
] as const;

for (const c of cases) {
  const r = buildCrossSection(ex, { layerId: c.layerId, refAbove: c.refs[0], refBelow: c.refs[1] });
  if (!r.ok) throw new Error(r.error);
  const S = 'S' in c ? c.S : undefined;
  const build = makeBuild(r.xs, { W: c.W, S });
  const order = richOrder(r.xs.T);
  const z = (q: number): { z: number; nodes: number } => {
    if (S === undefined) { const x = richSE(build, q, order); return { z: x.Z0, nodes: x.nodes }; }
    const x = richDiff(build, q, order); return { z: x.Zdiff, nodes: x.nodes };
  };
  const t0 = performance.now();
  const a = z(2), b = z(4);
  const ms = performance.now() - t0;
  console.log(
    `${c.name.padEnd(22)} Z(q2) = ${a.z.toFixed(4)}  rich(4,8) = ${b.z.toFixed(4)}  ` +
    `diff ${((a.z / b.z - 1) * 100).toFixed(4)} %  legacy ${c.legacy}  shift ${(a.z - c.legacy).toFixed(3)}  ` +
    `nodes(q8) ${b.nodes}  ${ms.toFixed(0)} ms`,
  );
}
