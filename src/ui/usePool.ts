import { useEffect } from 'react';
import { SolverPool } from '../solver/pool';

let pool: SolverPool | null = null;

/** Shared lazily-created solver pool. The singleton outlives any component, so unmount does nothing. */
export function usePool(): SolverPool {
  if (!pool) pool = new SolverPool();
  useEffect(() => () => { /* shared singleton: nothing to dispose on unmount */ }, []);
  return pool;
}
