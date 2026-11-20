import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  'aria-label'?: string;
  title?: string;
  className?: string;
}

const show = (v: number) => (Number.isFinite(v) ? String(parseFloat(v.toFixed(6))) : '');

/** Plain (unitless) number input; emits only valid numbers the user typed. */
export function NumInput({ value, onChange, className, title, ...rest }: Props) {
  const [text, setText] = useState(() => show(value));
  const last = useRef(value);
  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    if (Number(text.replace(',', '.')) === value) return;
    setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="text" inputMode="decimal" className={`num ${className ?? ''}`} value={text} title={title}
      aria-label={rest['aria-label']}
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.trim();
        const v = t === '' ? NaN : Number(t.replace(',', '.'));
        if (Number.isFinite(v)) onChange(v);
      }}
      onBlur={() => setText(show(value))}
    />
  );
}
