export type Unit = 'mm' | 'mil' | 'um';

const MM_PER: Record<Unit, number> = { mm: 1, mil: 0.0254, um: 0.001 };

export function toDisplay(mm: number, u: Unit): number {
  return mm / MM_PER[u];
}

export function fromDisplay(v: number, u: Unit): number {
  return v * MM_PER[u];
}

export function formatLen(mm: number, u: Unit, digits = 3): string {
  return `${toDisplay(mm, u).toFixed(digits)} ${u}`;
}
