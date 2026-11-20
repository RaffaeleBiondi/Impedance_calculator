import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { AppState } from './types';
import { reducer, type Action } from './reducer';
import { loadInitialState } from '../io/load';
import { encodeHash } from '../io/urlState';
import { KEYS, storage } from '../io/storage';

interface Shell { app: AppState; notice?: string }
export type StoreAction = Action | { type: 'dismissNotice' };

function shellReducer(s: Shell, a: StoreAction): Shell {
  if (a.type === 'dismissNotice') return { app: s.app, notice: undefined };
  const r = reducer(s.app, a);
  return { app: r.state, notice: r.notice };
}

interface Ctx {
  state: AppState;
  notice?: string;
  dispatch: (a: StoreAction) => void;
}
const StoreCtx = createContext<Ctx | null>(null);

export const AUTOSAVE_DEBOUNCE_MS = 500;

function init(): Shell {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  const r = loadInitialState(hash, storage);
  return { app: r.state, notice: r.notice };
}

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [shell, dispatch] = useReducer(shellReducer, undefined, () => (initial ? { app: initial } : init()));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      storage.set(KEYS.autosave, shell.app);
      try { history.replaceState(null, '', encodeHash(shell.app)); } catch { /* ignore */ }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [shell.app]);

  const value = useMemo<Ctx>(() => ({ state: shell.app, notice: shell.notice, dispatch }), [shell]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore must be used inside <StoreProvider>');
  return c;
}
