import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import type { RpcRequest, RpcResponse } from './types.js';

interface WorkerManifest {
  name: string;
  prefix: string;
}

export class ModuleWorker {
  name = '';
  prefix = '';
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  readonly events = new EventEmitter();

  constructor(readonly workerFile: string, readonly execArgv: string[] = []) {}

  async start(): Promise<void> {
    this.worker = new Worker(this.workerFile, { execArgv: this.execArgv });
    this.worker.on('message', (msg: RpcResponse) => this.onMessage(msg));
    this.worker.on('error', (err) => this.events.emit('crash', err));
    const manifest = await this.call<WorkerManifest>('__manifest');
    this.name = manifest.name;
    this.prefix = manifest.prefix;
  }

  private onMessage(msg: RpcResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.data);
    else p.reject(new Error(msg.error));
  }

  async call<T = unknown>(action: string, payload?: unknown): Promise<T> {
    const worker = this.worker;
    if (!worker) throw new Error(`Worker ${this.name || this.workerFile} not started`);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, action, payload } satisfies RpcRequest);
    });
  }

  async stop(): Promise<void> {
    if (!this.worker) return;
    await this.worker.terminate();
    this.worker = null;
  }
}
