import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const validation = process.env.VALIDATION === '1';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: validation ? ['node_modules/**'] : ['node_modules/**', '**/*.validation.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
