import type { SynthResult } from '../solver/synthesis';
import type { Unit } from '../model/units';
import { lenText } from './lenText';

type Fail = Extract<SynthResult, { ok: false }>;
type Ok = Extract<SynthResult, { ok: true }>;
interface Ctx { op: 'findW' | 'findS' | 'compact'; target: number; tolPct: number; fmin: number; W: number; unit: Unit }

const zt = (z: number) => z.toFixed(1);
const pct = (t: number) => +t.toFixed(2);

/** One-line text for a failed synthesis, built from the structured fields in the display unit (worker text is mm/ohm). */
export function failText(r: Fail, c: Ctx): string {
  const t = `${+c.target.toFixed(2)} Ω`;
  const range = r.zRange && r.zRange.every(Number.isFinite) ? `${zt(r.zRange[0])} to ${zt(r.zRange[1])} Ω` : null;
  if (range && r.reason === 'below-fab') {
    const name = c.op === 'findS' ? 'gap' : 'W';
    const m = lenText(c.fmin, c.unit);
    return `${t} needs ${name} below the fab minimum ${m}; ${name} ≥ ${m} gives ${range}`;
  }
  if (range && r.reason === 'out-of-range') {
    if (c.op === 'findS') return `With W ${lenText(c.W, c.unit)} the pair reaches ${range}, not ${t}`;
    if (c.op === 'compact') return `No geometry within ±${pct(c.tolPct)} % of ${t}: Z reaches ${range}`;
    return `${t} is out of reach: Z goes from ${range}`;
  }
  return r.message.replace(/\bohm\b/g, 'Ω');
}

const WHY: Record<string, (t: number) => string> = {
  wmin: () => 'W is at the fab minimum and Z stays in tolerance.',
  smin: () => 'The gap is at the fab minimum and W hits the target.',
  corner: () => 'W and gap are at the fab minimum and Z stays in tolerance.',
  zhi: (t) => `Z is at the upper edge (+${t} %): a narrower trace leaves tolerance, so no margin for process variation.`,
  zlo: (t) => `W is at the minimum and the gap is the smallest that keeps Z above the lower edge (−${t} %): no margin for process variation.`,
};

/** One line plus a "Why?" detail for a compact-mode success. */
export function compactText(r: Ok, diff: boolean, tolPct: number, unit: Unit): { text: string; detail?: string } {
  const t = pct(tolPct);
  const text = diff && r.S != null
    ? `Most compact pair within ±${t} %: W ${lenText(r.W, unit)} / gap ${lenText(r.S, unit)} (2W + gap ${lenText(2 * r.W + r.S, unit)})`
    : `Narrowest trace within ±${t} %: W ${lenText(r.W, unit)}`;
  return { text, detail: r.bound && WHY[r.bound] ? WHY[r.bound](t) : undefined };
}
