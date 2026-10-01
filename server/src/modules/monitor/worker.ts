import { parentPort } from 'node:worker_threads';
import os from 'node:os';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';

interface Sample {
  at: string;
  cpuLoad: [number, number, number];
  memUsagePercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
}

const MAX_SAMPLES = 720;
const INTERVAL_MS = 60_000;

const samples: Sample[] = [];
let timer: NodeJS.Timeout | null = null;

function takeSample(): void {
  const total = os.totalmem();
  const free = os.freemem();
  const avg = os.loadavg();
  samples.push({
    at: new Date().toISOString(),
    cpuLoad: [avg[0] ?? 0, avg[1] ?? 0, avg[2] ?? 0],
    memUsagePercent: total > 0 ? Math.round(((total - free) / total) * 100) : 0,
    memUsedBytes: total - free,
    memTotalBytes: total,
  });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

function startMonitor(): void {
  if (timer) return;
  takeSample();
  timer = setInterval(takeSample, INTERVAL_MS);
  timer.unref?.();
}

const definition: ModuleDefinition = {
  name: 'monitor',
  prefix: 'monitor',
  actions: {
    'history': {
      summary: 'Historique CPU/RAM (échantillons 1/min, 12h max.) (payload: { minutes? })',
      handler: (payload) => {
        startMonitor();
        const p = (payload ?? {}) as Record<string, unknown>;
        const minutes = typeof p.minutes === 'number' && p.minutes > 0 && p.minutes <= 720 ? Math.floor(p.minutes) : 60;
        const since = Date.now() - minutes * 60_000;
        return {
          intervalSeconds: INTERVAL_MS / 1000,
          samples: samples.filter((s) => Date.parse(s.at) >= since),
        };
      },
    },
    'latest': {
      summary: 'Dernier échantillon CPU/RAM',
      handler: () => {
        startMonitor();
        const last = samples[samples.length - 1];
        if (!last) throw new Error('Aucun échantillon disponible');
        return last;
      },
    },
    'summary': {
      summary: 'Statistiques agrégées sur la période (payload: { minutes? })',
      handler: (payload) => {
        startMonitor();
        const p = (payload ?? {}) as Record<string, unknown>;
        const minutes = typeof p.minutes === 'number' && p.minutes > 0 && p.minutes <= 720 ? Math.floor(p.minutes) : 60;
        const since = Date.now() - minutes * 60_000;
        const window = samples.filter((s) => Date.parse(s.at) >= since);
        if (window.length === 0) throw new Error('Aucun échantillon sur la période');
        const memPercents = window.map((s) => s.memUsagePercent);
        const loads1 = window.map((s) => s.cpuLoad[0]);
        const cores = os.cpus().length || 1;
        return {
          minutes,
          samples: window.length,
          cpuLoadAvg1: Number((loads1.reduce((a, b) => a + b, 0) / loads1.length).toFixed(2)),
          cpuLoadMax1: Number(Math.max(...loads1).toFixed(2)),
          cpuUsagePercentMax: Math.round((Math.max(...loads1) / cores) * 100),
          memUsagePercentMin: Math.min(...memPercents),
          memUsagePercentMax: Math.max(...memPercents),
          memUsagePercentAvg: Math.round(memPercents.reduce((a, b) => a + b, 0) / memPercents.length),
        };
      },
    },
  },
};

if (!parentPort) throw new Error('monitor worker must run in a worker thread');
const port = parentPort;

port.on('message', (msg: RpcRequest) => {
  const respond = (res: RpcReply): void => {
    port.postMessage({ ...res, id: msg.id });
  };
  if (msg.action === '__manifest') {
    respond({
      ok: true,
      data: {
        name: definition.name,
        prefix: definition.prefix,
        actions: Object.entries(definition.actions).map(([action, a]) => ({
          action,
          summary: a.summary,
        })),
      },
    });
    return;
  }
  const entry = definition.actions[msg.action];
  if (!entry) {
    respond({ ok: false, error: `Unknown action: ${msg.action}` });
    return;
  }
  Promise.resolve()
    .then(() => entry.handler(msg.payload))
    .then((data) => respond({ ok: true, data }))
    .catch((err: unknown) => respond({ ok: false, error: err instanceof Error ? err.message : String(err) }));
});
