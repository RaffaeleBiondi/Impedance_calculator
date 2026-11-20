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
interface Slot { worker: WorkerLike; task: Task | null; dead: boolean }

const MAX_SPAWN_FAILURES = 3;

export class SolverPool {
  private slots: Slot[] = [];
  private queue: Task[] = [];
  private nextId = 1;
  private disposed = false;
  private failStreak = 0;
  private factory: () => WorkerLike;

  constructor(size: number = defaultPoolSize(), factory: () => WorkerLike = defaultFactory) {
    this.factory = factory;
    const n = Math.max(1, Math.floor(size));
    for (let i = 0; i < n; i++) {
      const slot: Slot = { worker: this.factory(), task: null, dead: false };
      this.attach(slot);
      this.slots.push(slot);
    }
  }

  private attach(slot: Slot) {
    const w = slot.worker;
    w.onmessage = (e) => {
      if (slot.worker !== w) return;
      this.failStreak = 0;
      const t = slot.task;
      if (!t || e.data.id !== t.id) return;
      slot.task = null;
      if (e.data.ok) t.resolve(e.data.res); else t.reject(new Error(e.data.err));
      this.pump();
    };
    w.onerror = (ev) => {
      if (slot.worker !== w || this.disposed) return; // stale event from a replaced worker
      const t = slot.task;
      slot.task = null;
      w.terminate();
      this.failStreak++;
      if (this.failStreak >= MAX_SPAWN_FAILURES) {
        slot.dead = true;
        if (this.slots.every((s) => s.dead)) {
          for (const q of this.queue.splice(0)) q.reject(new Error('solver worker failed to start'));
        }
      } else {
        slot.worker = this.factory();
        this.attach(slot);
      }
      if (t) t.reject(new Error((ev as { message?: string } | null)?.message ?? 'worker error'));
      this.pump();
    };
  }

  private pump() {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (slot.task || slot.dead) continue;
      const t = this.queue.shift();
      if (!t) return;
      slot.task = t;
      slot.worker.postMessage({ id: t.id, job: t.job });
    }
  }

  /** Cancel several tasks: drop queued ones first, then terminate running ones, then pump once. */
  private cancelTasks(tasks: Task[]) {
    const running: Slot[] = [];
    const rejected: Task[] = [];
    for (const t of tasks) {
      const qi = this.queue.indexOf(t);
      if (qi >= 0) { this.queue.splice(qi, 1); rejected.push(t); continue; }
      const slot = this.slots.find((s) => s.task === t);
      if (slot) { running.push(slot); rejected.push(t); }
    }
    for (const slot of running) {
      slot.task = null;
      slot.worker.terminate();
      slot.worker = this.factory();
      this.attach(slot);
    }
    for (const t of rejected) t.reject('cancelled');
    this.pump();
  }

  private enqueue<T>(job: Job): { task: Task; promise: Promise<T> } {
    let task!: Task;
    const promise = new Promise<T>((resolve, reject) => { task = { id: this.nextId++, job, resolve, reject }; });
    if (this.disposed) task.reject(new Error('pool disposed'));
    else if (this.slots.every((s) => s.dead)) task.reject(new Error('solver worker failed to start'));
    else { this.queue.push(task); this.pump(); }
    return { task, promise };
  }

  run<T>(job: Job): { promise: Promise<T>; cancel(): void } {
    const { task, promise } = this.enqueue<T>(job);
    return { promise, cancel: () => this.cancelTasks([task]) };
  }

  runBatch<T>(jobs: Job[], onProgress?: (done: number, total: number) => void): { promise: Promise<T[]>; cancel(): void } {
    const total = jobs.length;
    let done = 0;
    const items = jobs.map((j) => this.enqueue<T>(j));
    const tasks = items.map((i) => i.task);
    const promise = Promise.all(
      items.map((i) => i.promise.then((v) => { onProgress?.(++done, total); return v; })),
    ).catch((e) => { this.cancelTasks(tasks); throw e; });
    return { promise, cancel: () => this.cancelTasks(tasks) };
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
