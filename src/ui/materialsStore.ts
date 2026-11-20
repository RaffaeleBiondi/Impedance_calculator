import { useSyncExternalStore } from 'react';
import type { Material } from '../model/materials';
import { KEYS, storage } from '../io/storage';

let user: Material[] = (() => {
  const v = storage.get<unknown>(KEYS.materials);
  return Array.isArray(v) ? (v as Material[]).filter((m) => m && typeof m.id === 'string') : [];
})();
const subs = new Set<() => void>();

function commit(next: Material[]) {
  user = next;
  storage.set(KEYS.materials, user);
  subs.forEach((f) => f());
}

const newId = () => `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** User materials, persisted in localStorage (lotO.materials). Presets live in model/materials. */
export const materialsApi = {
  saveUser(m: Material) {
    const u: Material = { ...m, preset: false };
    commit(user.some((x) => x.id === m.id) ? user.map((x) => (x.id === m.id ? u : x)) : [...user, u]);
  },
  removeUser(id: string) { commit(user.filter((m) => m.id !== id)); },
  duplicate(m: Material): Material {
    const copy: Material = { ...m, id: newId(), name: `${m.name} (copy)`, preset: false };
    commit([...user, copy]);
    return copy;
  },
  newId,
};

export function useUserMaterials(): Material[] {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => user,
  );
}
