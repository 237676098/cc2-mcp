import { v4 as uuidv4 } from 'uuid';
import { BridgeResponse, DEFAULT_TIMEOUT } from './protocol.js';

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestQueue {
  private pending = new Map<string, PendingRequest>();

  createRequest(timeoutMs: number = DEFAULT_TIMEOUT): { id: string; promise: Promise<unknown> } {
    const id = uuidv4();
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
    });

    return { id, promise };
  }

  handleResponse(response: BridgeResponse): boolean {
    const pending = this.pending.get(response.id);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.success) {
      pending.resolve(response.data);
    } else {
      const err = response.error;
      pending.reject(new Error(err?.message ?? 'Unknown bridge error'));
    }
    return true;
  }

  rejectAll(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  get size(): number {
    return this.pending.size;
  }
}
