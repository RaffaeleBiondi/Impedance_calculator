import { useEffect, useState } from 'react';
import { KEYS, storage } from '../io/storage';

export type ThemeChoice = 'auto' | 'light' | 'dark';
export const THEME_EVENT = 'lotO-theme-change';

export function loadTheme(): ThemeChoice {
  const v = storage.get<string>(KEYS.theme);
  return v === 'light' || v === 'dark' ? v : 'auto';
}

export function applyTheme(t: ThemeChoice): void {
  const el = document.documentElement;
  if (t === 'auto') delete el.dataset.theme; else el.dataset.theme = t;
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Returns a counter that changes whenever the theme changes (explicit toggle or OS preference),
 *  so canvas/SVG drawings that read CSS variables can redraw by listing it as an effect dependency. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((n) => n + 1);
    window.addEventListener(THEME_EVENT, bump);
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    mq?.addEventListener?.('change', bump);
    return () => { window.removeEventListener(THEME_EVENT, bump); mq?.removeEventListener?.('change', bump); };
  }, []);
  return v;
}
