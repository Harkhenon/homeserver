import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import type { RpcRequest, RpcResponse } from './types.js';
import { logger } from './logger.js';

interface WorkerManifest {
  name: string;
  prefix: string;
}

const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 60_000;

export class ModuleWorker {
  name = '';
  prefix = '';
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private restarts: number[] = [];
  private stopped = false;
  readonly events = new EventEmitter();

  constructor(readonly workerFile: string, readonly execArgv: string[] = []) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.worker = new Worker(this.workerFile, { execArgv: this.execArgv });
    this.worker.on('message', (msg: RpcResponse) => this.onMessage(msg));
    this.worker.on('error', (err) => this.onCrash(err));
    this.worker.on('exit', (code) => {
      if (!this.stopped) this.onCrash(new Error(`worker exited with code ${code}`));
    });
    const manifest = await this.call<WorkerManifest>('__manifest');
    this.name = manifest.name;
    this.prefix = manifest.prefix;
    this.events.emit('started', this.name);
  }

  private onCrash(err: Error): void {
    logger.error(`module ${this.name || this.workerFile} crash:`, err.message);
    for (const p of this.pending.values()) p.reject(new Error(`Module ${this.name} indisponible`));
    this.pending.clear();
    this.events.emit('crash', err);
    void this.autoRestart();
  }

  private async autoRestart(): Promise<void> {
    if (this.stopped) return;
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (this.restarts.length >= MAX_RESTARTS) {
      logger.error(`module ${this.name}: trop de redémarrages (${MAX_RESTARTS}/${RESTART_WINDOW_MS / 1000}s), abandon`);
      this.events.emit('disabled');
      return;
    }
    this.restarts.push(now);
    const delay = Math.min(1000 * 2 ** this.restarts.length, 15_000);
    logger.warn(`module ${this.name}: redémarrage dans ${delay}ms (${this.restarts.length}/${MAX_RESTARTS})`);
    await new Promise((r) => setTimeout(r, delay));
    if (this.stopped) return;
    try {
      await this.worker?.terminate();
    } catch { /* déjà mort */ }
    try {
      await this.start();
      logger.info(`module ${this.name}: redémarré`);
    } catch (err) {
      logger.error(`module ${this.name}: échec redémarrage:`, err instanceof Error ? err.message : err);
      void this.autoRestart();
    }
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

  async ping(timeoutMs = 3_000): Promise<boolean> {
    try {
      const start = Date.now();
      await this.call('__manifest');
      return Date.now() - start <= timeoutMs;
    } catch {
      return false;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (!this.worker) return;
    await this.worker.terminate();
    this.worker = null;
  }
}
