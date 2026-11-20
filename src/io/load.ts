import type { AppState } from '../state/types';
import { defaultAppState } from '../state/types';
import { decodeHash, checkAppState } from './urlState';
import { KEYS, type storage } from './storage';
import { normalizeSelection } from '../state/reducer';

export function loadInitialState(
  hash: string, store: typeof storage,
): { state: AppState; source: 'hash' | 'storage' | 'example'; notice?: string } {
  let notice: string | undefined;
  if (hash && hash !== '#') {
    const d = decodeHash(hash);
    if (d.ok) {
      const n = normalizeSelection(d.state);
      return { state: n.state, source: 'hash', notice: n.notice };
    }
    notice = `Could not load the shared link (${d.error}).`;
  }
  let saved: unknown = null;
  try { saved = store.get<unknown>(KEYS.autosave); } catch { saved = null; }
  if (saved !== null) {
    const c = checkAppState(saved);
    if (c.ok) {
      const n = normalizeSelection(c.state);
      const parts = [notice && `${notice} Restored your last session instead.`, n.notice].filter(Boolean);
      return { state: n.state, source: 'storage', notice: parts.length ? parts.join(' ') : undefined };
    }
    notice = (notice ? notice + ' ' : '') + 'Saved session was invalid and was ignored.';
  }
  return { state: defaultAppState(), source: 'example', notice: notice ? `${notice} Loaded the example stackup.` : undefined };
}
