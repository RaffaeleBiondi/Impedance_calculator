import { describe, expect, it } from 'vitest';
import { SolverPool, type WorkerLike } from '../../src/solver/pool';
import type { Job } from '../../src/solver/protocol';

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: any }) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  terminated = false;
  received: any[] = [];
  autoReply: boolean;
  constructor(autoReply = true) { this.autoReply = autoReply; }
  postMessage(msg: any) {
    this.received.push(msg);
    if (this.autoReply) setTimeout(() => { if (!this.terminated) this.onmessage?.({ data: { id: msg.id, ok: true, res: msg.job.value } }); }, 1);
  }
  terminate() { this.terminated = true; }
}
const job = (value: number) => ({ op: 'sweepPoint', value } as unknown as Job);

describe('SolverPool', () => {
  it('runBatch of 5 jobs on size 2 resolves in order and reports progress 5 times', async () => {
    const made: FakeWorker[] = [];
    const pool = new SolverPool(2, () => { const w = new FakeWorker(); made.push(w); return w; });
    const progress: number[] = [];
    const { promise } = pool.runBatch<number>([1, 2, 3, 4, 5].map(job), (d, t) => { expect(t).toBe(5); progress.push(d); });
    expect(await promise).toEqual([1, 2, 3, 4, 5]);
    expect(progress.length).toBe(5);
    expect(made.length).toBe(2);
    pool.dispose();
  });

  it('cancel rejects with "cancelled", terminates and replaces the worker', async () => {
    const made: FakeWorker[] = [];
    const pool = new SolverPool(1, () => { const w = new FakeWorker(false); made.push(w); return w; });
    const { promise, cancel } = pool.run(job(1));
    const p = expect(promise).rejects.toBe('cancelled');
    cancel();
    await p;
    expect(made[0].terminated).toBe(true);
    expect(made.length).toBe(2);
    pool.dispose();
  });

  it('cancel of a queued job rejects without terminating a worker', async () => {
    const made: FakeWorker[] = [];
    const pool = new SolverPool(1, () => { const w = new FakeWorker(false); made.push(w); return w; });
    pool.run(job(1)).promise.catch(() => {});
    const q = pool.run(job(2));
    const p = expect(q.promise).rejects.toBe('cancelled');
    q.cancel();
    await p;
    expect(made[0].terminated).toBe(false);
    pool.dispose();
  });

  it('batch cancel rejects the batch and a worker error rejects the job', async () => {
    const made: FakeWorker[] = [];
    const pool = new SolverPool(1, () => { const w = new FakeWorker(false); made.push(w); return w; });
    const b = pool.runBatch([job(1), job(2)]);
    const p = expect(b.promise).rejects.toBe('cancelled');
    b.cancel();
    await p;
    const r = pool.run(job(3));
    const p2 = expect(r.promise).rejects.toThrow('boom');
    made[made.length - 1].onmessage?.({ data: { id: made[made.length - 1].received[0].id, ok: false, err: 'boom' } });
    await p2;
    pool.dispose();
  });
});
