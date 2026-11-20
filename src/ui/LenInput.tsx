import { useEffect, useRef, useState } from 'react';
import { fromDisplay, toDisplay, type Unit } from '../model/units';

interface Props {
  valueMm: number;
  unit: Unit;
  onChangeMm: (mm: number) => void;
  className?: string;
  'aria-label'?: string;
  title?: string;
  disabled?: boolean;
}

/** Number shown to the user: rounded for display only (the stored mm value is untouched). */
export function displayText(mm: number, unit: Unit): string {
  if (!Number.isFinite(mm)) return '';
  return String(parseFloat(toDisplay(mm, unit).toFixed(4)));
}

const parse = (t: string): number | null => {
  if (t.trim() === '') return null;
  const v = Number(t.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** Length input: shows mm in the chosen unit; emits mm only when the user edits. */
export function LenInput({ valueMm, unit, onChangeMm, className, disabled, title, ...rest }: Props) {
  const [text, setText] = useState(() => displayText(valueMm, unit));
  const last = useRef({ valueMm, unit });

  useEffect(() => {
    const unitChanged = last.current.unit !== unit;
    const valueChanged = last.current.valueMm !== valueMm;
    last.current = { valueMm, unit };
    if (!unitChanged && !valueChanged) return;
    // keep what the user is typing if it already represents this value
    const p = parse(text);
    if (!unitChanged && p !== null && fromDisplay(p, unit) === valueMm) return;
    setText(displayText(valueMm, unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMm, unit]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`len ${className ?? ''}`}
      value={text}
      disabled={disabled}
      title={title}
      aria-label={rest['aria-label']}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const p = parse(t);
        if (p !== null) onChangeMm(fromDisplay(p, unit));
      }}
      onBlur={() => setText(displayText(valueMm, unit))}
    />
  );
}
