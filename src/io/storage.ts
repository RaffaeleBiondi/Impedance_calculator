export const KEYS = {
  autosave: 'lotO.autosave',
  saved: 'lotO.saved',
  materials: 'lotO.materials',
} as const;

export const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = globalThis.localStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch { return null; }
  },
  set(key: string, v: unknown): boolean {
    try { globalThis.localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
  },
  remove(key: string): void {
    try { globalThis.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
