export type SNode = string | number | SNode[];

/**
 * Tolerant S-expression reader for KiCad board files.
 * Parses only from the first "(layers" onward, as a flat list of top-level forms,
 * and stops after the "(setup" form (the stackup lives inside it). Returns [] if
 * no "(layers" is found. Quoted strings stay strings; bare numeric atoms become numbers.
 */
export function parseSexpr(text: string): SNode {
  const start = text.indexOf('(layers');
  if (start < 0) return [];
  const out: SNode[] = [];
  let i = start;
  const n = text.length;

  const skipWs = () => { while (i < n && /\s/.test(text[i])) i++; };

  function readForm(): SNode | undefined {
    skipWs();
    if (i >= n) return undefined;
    const c = text[i];
    if (c === '(') {
      i++;
      const list: SNode[] = [];
      for (;;) {
        skipWs();
        if (i >= n) return list; // tolerate truncation
        if (text[i] === ')') { i++; return list; }
        const v = readForm();
        if (v === undefined) return list;
        list.push(v);
      }
    }
    if (c === ')') { i++; return readForm(); } // stray close: ignore
    if (c === '"') {
      i++;
      let s = '';
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) i++;
        s += text[i++];
      }
      i++;
      return s;
    }
    const b = i;
    while (i < n && !/[\s()"]/.test(text[i])) i++;
    const tok = text.slice(b, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(tok)) return Number(tok);
    return tok;
  }

  for (;;) {
    const f = readForm();
    if (f === undefined) break;
    out.push(f);
    if (Array.isArray(f) && f[0] === 'setup') break;
  }
  return out;
}
