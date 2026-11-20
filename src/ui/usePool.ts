import { useEffect } from 'react';
import { SolverPool } from '../solver/pool';

let pool: SolverPool | null = null;

/** The app-wide solver pool: a lazily created module singleton, shared by every panel. */
export function usePool(): SolverPool {
  if (!pool) pool = new SolverPool();
  useEffect(() => () => {
    // Shared singleton: nothing to dispose when one consumer unmounts.
  }, []);
  return pool;
}
