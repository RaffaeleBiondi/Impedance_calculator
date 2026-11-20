import { useEffect, useState } from 'react';
import { KEYS, storage } from '../io/storage';
import { applyTheme, loadTheme, type ThemeChoice } from './theme';

const OPTIONS: { id: ThemeChoice; label: string }[] = [
  { id: 'auto', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const choose = (t: ThemeChoice) => { setTheme(t); storage.set(KEYS.theme, t); };
  return (
    <div className="themetoggle" role="group" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" className={`pill${theme === o.id ? ' on' : ''}`} aria-pressed={theme === o.id}
          onClick={() => choose(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
