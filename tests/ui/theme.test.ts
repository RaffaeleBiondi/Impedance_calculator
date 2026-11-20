import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/ui/theme.css', import.meta.url), 'utf8');

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Every value of a custom property, in file order: [light, dark (media), dark (data-theme)]. */
const values = (name: string) => [...css.matchAll(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);

describe('validation status colours', () => {
  it('.status-pass uses the --ok token, which has a dark override', () => {
    expect(css).toMatch(/\.status-pass\s*\{\s*color:\s*var\(--ok\)/);
    expect(values('--ok')).toHaveLength(3);
  });
  it('--ok reaches WCAG AA (4.5:1) on the panel in light and dark', () => {
    const ok = values('--ok'), panel = values('--panel');
    expect(contrast(ok[0], panel[0])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ok[1], panel[1])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ok[2], panel[2])).toBeGreaterThanOrEqual(4.5);
  });
});
