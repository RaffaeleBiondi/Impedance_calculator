import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { AppState } from './types';
import { reducer, type Action } from './reducer';
import { loadInitialState } from '../io/load';
import { encodeHash } from '../io/urlState';
import { KEYS, storage } from '../io/storage';

/** `rev` counts whole-stackup replacements, so views can drop local state keyed by layer ids. */
interface Shell { app: AppState; notice?: string; rev: number }
export type StoreAction = Action | { type: 'dismissNotice' };

function shellReducer(s: Shell, a: StoreAction): Shell {
  if (a.type === 'dismissNotice') return { ...s, notice: undefined };
  const r = reducer(s.app, a);
  const replaced = a.type === 'replaceStackup' || a.type === 'resetExample';
  return { app: r.state, notice: r.notice, rev: replaced ? s.rev + 1 : s.rev };
}

interface Ctx {
  state: AppState;
  notice?: string;
  /** Increments on every whole-stackup replacement (import, named load, reset to example). */
  stackupRev: number;
  dispatch: (a: StoreAction) => void;
}
const StoreCtx = createContext<Ctx | null>(null);

export const AUTOSAVE_DEBOUNCE_MS = 500;

function init(): Shell {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  const r = loadInitialState(hash, storage);
  return { app: r.state, notice: r.notice, rev: 0 };
}

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [shell, dispatch] = useReducer(shellReducer, undefined, () => (initial ? { app: initial, rev: 0 } : init()));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      storage.set(KEYS.autosave, shell.app);
      try { history.replaceState(null, '', encodeHash(shell.app)); } catch { /* ignore */ }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [shell.app]);

  const value = useMemo<Ctx>(() => ({ state: shell.app, notice: shell.notice, stackupRev: shell.rev, dispatch }), [shell]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore must be used inside <StoreProvider>');
  return c;
}
