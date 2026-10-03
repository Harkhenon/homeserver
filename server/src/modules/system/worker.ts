import { parentPort } from 'node:worker_threads';
import os from 'node:os';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { PendingUpdatesResult } from '../../core/privileged/contract.js';

const run = promisify(execFile);

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

interface DiskInfo {
  mount: string;
  device: string;
  fsType: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

async function readDisks(): Promise<DiskInfo[]> {
  try {
    const { stdout } = await run('df', ['-B1', '--local', '--output=source,fstype,size,used,avail,pcent,target'], { timeout: 10_000 });
    return stdout
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((cols) => cols.length >= 7)
      .map((cols) => ({
        device: cols[0] ?? '',
        fsType: cols[1] ?? '',
        totalBytes: Number(cols[2]),
        usedBytes: Number(cols[3]),
        freeBytes: Number(cols[4]),
        usagePercent: Number(String(cols[5]).replace('%', '')),
        mount: cols.slice(6).join(' '),
      }));
  } catch {
    return [];
  }
}

function readNetwork() {
  const interfaces = os.networkInterfaces();
  return Object.entries(interfaces).map(([name, addrs]) => ({
    name,
    addresses: (addrs ?? []).map((a) => ({
      address: a.address,
      family: a.family,
      internal: a.internal,
    })),
  }));
}

interface ProcessInfo {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  command: string;
}

async function readProcesses(sort: 'cpu' | 'mem' = 'cpu', limit = 20): Promise<ProcessInfo[]> {
  try {
    const { stdout } = await run('ps', ['-eo', 'pid,user,pcpu,pmem,comm', '--no-headers', '--sort=-' + (sort === 'cpu' ? 'pcpu' : 'pmem')], { timeout: 10_000 });
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(0, limit)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: Number(parts[0]),
          user: parts[1] ?? '',
          cpuPercent: Number(parts[2]),
          memPercent: Number(parts[3]),
          command: parts.slice(4).join(' '),
        };
      });
  } catch {
    return [];
  }
}

function readDistroPretty(): string {
  if (!existsSync('/etc/os-release')) return 'unknown';
  const m = readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]+)"?/m);
  return m?.[1] ?? 'unknown';
}

const definition: ModuleDefinition = {
  name: 'system',
  prefix: 'system',
  actions: {
    info: {
      summary: 'Informations générales du serveur (hostname, OS, uptime, noyau)',
      handler: () => ({
        hostname: os.hostname(),
        platform: os.platform(),
        distro: readDistroPretty(),
        kernel: os.release(),
        arch: os.arch(),
        uptimeSeconds: readUptimeSeconds(),
      }),
    },
    cpu: {
      summary: 'CPU : modèle, cœurs, charge, utilisation',
      handler: () => {
        const load = readLoadAverages();
        const cores = readCpuInfo().cores;
        return {
          ...readCpuInfo(),
          load,
          usagePercent: Number(Math.min(100, (load[0] / Math.max(1, cores)) * 100).toFixed(1)),
        };
      },
    },
    memory: {
      summary: 'Mémoire : total, utilisé, libre',
      handler: () => readMemory(),
    },
    disks: {
      summary: 'Disques : occupation réelle (df)',
      handler: () => readDisks(),
    },
    network: {
      summary: 'Interfaces réseau et adresses IP',
      handler: () => ({ hostname: os.hostname(), interfaces: readNetwork() }),
    },
    processes: {
      summary: 'Processus les plus actifs (payload: { sort: "cpu"|"mem", limit })',
      handler: (payload) => {
        const p = (payload ?? {}) as { sort?: unknown; limit?: unknown };
        const sort = p.sort === 'mem' ? 'mem' : 'cpu';
        const limit = typeof p.limit === 'number' && p.limit > 0 && p.limit <= 100 ? Math.floor(p.limit) : 20;
        return readProcesses(sort, limit);
      },
    },
    upgrade: {
      summary: 'Appliquer les mises à jour système (apt-get / dnf upgrade)',
      handler: async () => {
        const res = await callHelper<{ family: string; upgraded: boolean }>({ action: 'packages_upgrade' });
        return res;
      },
    },
    updates: {
      summary: 'Paquets en attente de mise à jour (via helper privilégié)',
      handler: () => callHelper<PendingUpdatesResult>({ action: 'pending_updates' }),
    },
    sensors: {
      summary: 'Températures CPU si disponibles (/sys/class/thermal)',
      handler: () => {
        if (!existsSync('/sys/class/thermal')) return { available: false, zones: [] };
        const zones = readdirSync('/sys/class/thermal')
          .filter((n) => n.startsWith('thermal_zone'))
          .map((n) => {
            try {
              const temp = Number(readFileSync(`/sys/class/thermal/${n}/temp`, 'utf8')) / 1000;
              const type = readFileSync(`/sys/class/thermal/${n}/type`, 'utf8').trim();
              return { zone: n, type, tempC: Number.isFinite(temp) ? temp : null };
            } catch {
              return null;
            }
          })
          .filter((z): z is { zone: string; type: string; tempC: number | null } => z !== null);
        return { available: zones.length > 0, zones };
      },
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
