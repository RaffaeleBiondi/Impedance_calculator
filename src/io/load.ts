import type { AppState } from '../state/types';
import { defaultAppState } from '../state/types';
import { decodeHash, checkAppState } from './urlState';
import { KEYS, type storage } from './storage';

export function loadInitialState(
  hash: string, store: typeof storage,
): { state: AppState; source: 'hash' | 'storage' | 'example'; notice?: string } {
  let notice: string | undefined;
  if (hash && hash !== '#') {
    const d = decodeHash(hash);
    if (d.ok) return { state: d.state, source: 'hash' };
    notice = `Could not load the shared link (${d.error}).`;
  }
  let saved: unknown = null;
  try { saved = store.get<unknown>(KEYS.autosave); } catch { saved = null; }
  if (saved !== null) {
    const c = checkAppState(saved);
    if (c.ok) {
      return { state: c.state, source: 'storage', notice: notice ? `${notice} Restored your last session instead.` : undefined };
    }
    notice = (notice ? notice + ' ' : '') + 'Saved session was invalid and was ignored.';
  }
  return { state: defaultAppState(), source: 'example', notice: notice ? `${notice} Loaded the example stackup.` : undefined };
}
