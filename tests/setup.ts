import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Global inert pool: Task 14/15 UI tests render components calling usePool(); jsdom has no Worker.
// Never construct a real Worker in jsdom: UI tests get an inert pool unless they mock usePool themselves.
// Jobs never settle: run/runBatch return a pending promise with a no-op cancel, like the real pool's handles.
vi.mock('../src/ui/usePool', () => {
  const pending = () => ({ promise: new Promise<never>(() => {}), cancel: () => {} });
  return { usePool: () => ({ run: vi.fn(pending), runBatch: vi.fn(pending), dispose: vi.fn() }) };
});
