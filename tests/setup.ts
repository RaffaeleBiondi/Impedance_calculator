import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Never construct a real Worker in jsdom: UI tests get an inert pool unless they mock usePool themselves.
vi.mock('../src/ui/usePool', () => ({ usePool: () => ({ run: vi.fn(), runBatch: vi.fn(), dispose: vi.fn() }) }));
