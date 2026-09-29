import { parentPort } from 'node:worker_threads';
import os from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';

function readUptimeSeconds(): number {
  if (existsSync('/proc/uptime')) {
    const [s] = readFileSync('/proc/uptime', 'utf8').split(' ');
    return Math.floor(Number(s));
  }
  return Math.floor(os.uptime());
}

function readLoadAverages(): [number, number, number] {
  const avg = os.loadavg();
  return [avg[0] ?? 0, avg[1] ?? 0, avg[2] ?? 0];
}

function readCpuInfo() {
  const cpus = os.cpus();
  return {
    model: cpus[0]?.model ?? 'unknown',
    cores: cpus.length,
    speedMhz: Math.round((cpus[0]?.speed ?? 0) * 1000),
  };
}

function readMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    totalBytes: total,
    usedBytes: total - free,
    freeBytes: free,
    usagePercent: total > 0 ? Math.round(((total - free) / total) * 100) : 0,
  };
}

function readDisks() {
  return [
    { mount: '/', device: '/dev/root', totalBytes: 50 * 1024 ** 3, usedBytes: 12 * 1024 ** 3 },
  ];
}

const definition: ModuleDefinition = {
  name: 'system',
  prefix: 'system',
  actions: {
    info: {
      summary: 'Informations générales du serveur (hostname, OS, uptime)',
      handler: () => ({
        hostname: os.hostname(),
        platform: os.platform(),
        distro: process.env.HS_DISTRO_PRETTY ?? 'unknown',
        uptimeSeconds: readUptimeSeconds(),
      }),
    },
    cpu: {
      summary: 'CPU : modèle, cœurs, charge',
      handler: () => ({ ...readCpuInfo(), load: readLoadAverages() }),
    },
    memory: {
      summary: 'Mémoire : total, utilisé, libre',
      handler: () => readMemory(),
    },
    disks: {
      summary: 'Disques : occupation (données factices pour le moment)',
      handler: () => readDisks(),
    },
  },
};

if (!parentPort) throw new Error('system worker must run in a worker thread');
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
