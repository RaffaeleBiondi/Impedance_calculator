import type { SynthResult } from '../solver/synthesis';
import type { Unit } from '../model/units';
import { lenText } from './lenText';

type Ok = Extract<SynthResult, { ok: true }>;
/** A failed synthesis: the structured fields when present, and the worker text (mm, "ohm") as the last resort. */
export type Fail = Pick<Extract<SynthResult, { ok: false }>, 'message'> & Partial<Pick<Extract<SynthResult, { ok: false }>, 'reason' | 'zRange'>>;
/** `pitch` is the fixed pitch of a width-table class, when it has one. */
interface Ctx { op: 'findW' | 'findS' | 'compact'; target: number; tolPct: number; fmin: number; W: number; unit: Unit; pitch?: number }

const zt = (z: number) => z.toFixed(1);
const pct = (t: number) => +t.toFixed(2);

/** Signed percentage with `digits` decimals; values that round to zero print as 0 (never "-0.00"). */
export function signedPct(x: number, digits: number): string {
  const t = x.toFixed(digits);
  return Number(t) === 0 ? (0).toFixed(digits) : t;
}

/** Worker text to display text: mm lengths in the display unit, "ohm" as Ω, "+/-" as ±. */
export function displayText(msg: string, unit: Unit): string {
  return msg
    .replace(/(\d+(?:\.\d+)?)\s*mm\b/g, (_m, v: string) => lenText(Number(v), unit))
    .replace(/\bohm\b/g, 'Ω')
    .replace(/\+\/-/g, '±');
}

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
  if (r.reason === 'below-fab' && c.pitch !== undefined) {
    return `Pitch ${lenText(c.pitch, c.unit)} leaves no room for W and a gap of ${lenText(c.fmin, c.unit)}`;
  }
  return displayText(r.message, c.unit);
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
