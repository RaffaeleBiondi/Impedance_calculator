import { useEffect, useRef, useState } from 'react';
import type { AnalyzeResult } from '../solver/engine';
import type { LineGeom } from '../solver/problem';
import { fieldAspect, renderField } from './fieldRender';
import { useThemeVersion } from './theme';

interface Props {
  result: AnalyzeResult;
  line: LineGeom;
  names: { base: string | null; cover: string | null };
}

const cssVar = (n: string): string =>
  typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(n).trim() : '';

/** Canvas with the potential of the solved cross-section; redraws on resize and theme change. */
export function FieldPlot({ result, line, names }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const theme = useThemeVersion();
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const c = cv.current;
    if (!c || !result.ok) return;
    const dpr = window.devicePixelRatio || 1;
    const wCss = Math.max(280, width || 600);
    const g: LineGeom = { W: line.W, S: line.S, G: line.G, Wtop: line.Wtop };
    const hCss = Math.round(Math.min(300, Math.max(150, wCss * fieldAspect(result, g))));
    c.width = Math.round(wCss * dpr);
    c.height = Math.round(hCss * dpr);
    c.style.height = `${hCss}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    renderField(ctx, result, {
      width: c.width, height: c.height, dpr, line: g, names,
      colors: { copper: cssVar('--accent') || '#b87333', font: cssVar('--mono') || 'monospace' },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, line.W, line.S, line.G, line.Wtop, names.base, names.cover, width, theme]);

  const odd = result.ok && result.kind === 'diff';
  return (
    <div className="field">
      <div className="fieldbox" ref={box}>
        <canvas ref={cv} aria-label="Potential in the cross-section" />
      </div>
      <div className="legend">
        <span>{odd ? '−1 V' : '0 V'}</span>
        <span>{odd ? 'odd mode · ' : ''}contours 0.1 V</span>
        <span>{odd ? '+1 V' : '1 V'}</span>
      </div>
    </div>
  );
}
