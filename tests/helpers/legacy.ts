import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Legacy 2D field solver, kept byte-for-byte as the golden reference.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const legacy: any = require('../legacy/zsolver.legacy.cjs');
