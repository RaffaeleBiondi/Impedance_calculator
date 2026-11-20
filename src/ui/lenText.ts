import { toDisplay, type Unit } from '../model/units';

const DIGITS: Record<Unit, number> = { mm: 3, mil: 2, um: 1 };
const SUFFIX: Record<Unit, string> = { mm: 'mm', mil: 'mil', um: 'µm' };

/** A stored mm length as display text in the chosen unit ("0.135 mm", "5.31 mil", "135.0 µm"). */
export function lenText(mm: number, unit: Unit): string {
  return `${toDisplay(mm, unit).toFixed(DIGITS[unit])} ${SUFFIX[unit]}`;
}

export const unitSuffix = (u: Unit): string => SUFFIX[u];

/** εr shown with at most two decimals. */
export const erText = (er: number): string => String(+er.toFixed(2));
