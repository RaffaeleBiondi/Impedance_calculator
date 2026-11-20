import { collectTransferables, handleJob, type WorkerRequest, type WorkerResponse } from './protocol';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, job } = e.data;
  try {
    const res = handleJob(job);
    const msg: WorkerResponse = { id, ok: true, res };
    (self as unknown as Worker).postMessage(msg, collectTransferables(res));
  } catch (err) {
    const msg: WorkerResponse = { id, ok: false, err: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
