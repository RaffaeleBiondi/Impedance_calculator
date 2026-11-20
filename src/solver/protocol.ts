import type { GapRule } from '../model/gapRule';
import { analyze, type AnalyzeRequest } from './engine';
import { compactWithinTol, findS, findW, tableCell } from './synthesis';

export type Job =
  | { op: 'analyze'; req: AnalyzeRequest }
  | { op: 'findW'; req: AnalyzeRequest; target: number }
  | { op: 'findS'; req: AnalyzeRequest; target: number }
  | { op: 'compact'; req: AnalyzeRequest; target: number; tol: number; fmin: number }
  | { op: 'sweepPoint'; req: AnalyzeRequest; param: 'W' | 'S'; value: number }
  | { op: 'tableCell'; req: AnalyzeRequest; target: number; rule: GapRule; fmin: number; tol: number };

export type WorkerRequest = { id: number; job: Job };
export type WorkerResponse = { id: number; ok: true; res: unknown } | { id: number; ok: false; err: string };

/** Pure job dispatcher, shared by worker.ts and tests. */
export function handleJob(job: Job): unknown {
  switch (job.op) {
    case 'analyze':
      return analyze(job.req);
    case 'sweepPoint': {
      const line = job.param === 'W' ? { ...job.req.line, W: job.value } : { ...job.req.line, S: job.value };
      return analyze({ ...job.req, line });
    }
    case 'findW':
      return findW(job.req, job.target);
    case 'findS':
      return findS(job.req, job.target);
    case 'compact':
      return compactWithinTol(job.req, { target: job.target, tol: job.tol, fmin: job.fmin });
    case 'tableCell':
      return tableCell(job.req, job.target, job.rule, job.fmin, job.tol);
    default:
      throw new Error(`unsupported op: ${(job as Job).op}`);
  }
}

/** Collect the ArrayBuffers of every typed array in a result (own enumerable properties, deduplicated). */
export function collectTransferables(res: unknown): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  const seen = new Set<unknown>();
  const walk = (v: unknown) => {
    if (v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (ArrayBuffer.isView(v)) {
      if (v.buffer instanceof ArrayBuffer) out.add(v.buffer);
      return;
    }
    for (const k of Object.keys(v)) walk((v as Record<string, unknown>)[k]);
  };
  walk(res);
  return [...out];
}
