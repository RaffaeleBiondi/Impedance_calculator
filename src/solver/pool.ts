import type { Job, WorkerRequest, WorkerResponse } from './protocol';

export interface WorkerLike {
  postMessage(msg: WorkerRequest): void;
  terminate(): void;
  onmessage: ((e: { data: WorkerResponse }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

const defaultFactory = (): WorkerLike =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export function defaultPoolSize(): number {
  const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.min(8, Math.max(1, hc - 1));
}

interface Task { id: number; job: Job; resolve: (v: any) => void; reject: (e: unknown) => void }
interface Slot { worker: WorkerLike; task: Task | null }

export class SolverPool {
  private slots: Slot[] = [];
  private queue: Task[] = [];
  private nextId = 1;
  private disposed = false;
  private factory: () => WorkerLike;

  constructor(size: number = defaultPoolSize(), factory: () => WorkerLike = defaultFactory) {
    this.factory = factory;
    const n = Math.max(1, Math.floor(size));
    for (let i = 0; i < n; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.factory(), task: null };
    this.attach(slot);
    return slot;
  }

  private attach(slot: Slot) {
    slot.worker.onmessage = (e) => {
      const t = slot.task;
      if (!t || e.data.id !== t.id) return;
      slot.task = null;
      if (e.data.ok) t.resolve(e.data.res); else t.reject(new Error(e.data.err));
      this.pump();
    };
    slot.worker.onerror = (ev) => {
      const t = slot.task;
      slot.task = null;
      slot.worker.terminate();
      slot.worker = this.factory();
      this.attach(slot);
      if (t) t.reject(new Error(ev instanceof Error ? ev.message : 'worker error'));
      this.pump();
    };
  }

  private pump() {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (slot.task) continue;
      const t = this.queue.shift();
      if (!t) return;
      slot.task = t;
      slot.worker.postMessage({ id: t.id, job: t.job });
    }
  }

  private cancelTask(t: Task) {
    const qi = this.queue.indexOf(t);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
    } else {
      const slot = this.slots.find((s) => s.task === t);
      if (!slot) return; // already settled
      slot.task = null;
      slot.worker.terminate();
      slot.worker = this.factory();
      this.attach(slot);
    }
    t.reject('cancelled');
    this.pump();
  }

  run<T>(job: Job): { promise: Promise<T>; cancel(): void } {
    let task!: Task;
    const promise = new Promise<T>((resolve, reject) => { task = { id: this.nextId++, job, resolve, reject }; });
    if (this.disposed) {
      task.reject(new Error('pool disposed'));
    } else {
      this.queue.push(task);
      this.pump();
    }
    return { promise, cancel: () => this.cancelTask(task) };
  }

  runBatch<T>(jobs: Job[], onProgress?: (done: number, total: number) => void): { promise: Promise<T[]>; cancel(): void } {
    const total = jobs.length;
    let done = 0;
    const handles = jobs.map((j) => this.run<T>(j));
    const promise = Promise.all(
      handles.map((h) => h.promise.then((v) => { onProgress?.(++done, total); return v; })),
    ).catch((e) => { handles.forEach((h) => h.cancel()); throw e; });
    return { promise, cancel: () => handles.forEach((h) => h.cancel()) };
  }

  dispose() {
    this.disposed = true;
    for (const t of this.queue.splice(0)) t.reject(new Error('pool disposed'));
    for (const s of this.slots) {
      if (s.task) { s.task.reject(new Error('pool disposed')); s.task = null; }
      s.worker.terminate();
    }
    this.slots = [];
  }
}
