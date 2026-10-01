import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { DirEntryInfo } from '../../core/privileged/contract.js';

const CRON_DIR = '/etc/cron.d';
const NAME_RE = /^homeserver-[A-Za-z0-9_-]{1,50}$/;
const SCHEDULE_RE = /^(@(reboot|daily|hourly|weekly|monthly)|([0-9*/,-]+)\s+([0-9*/,-]+)\s+([0-9*/,-LW]+)\s+([0-9*/,-]+)\s+([0-9*/,-]+))$/;

interface CronJob {
  name: string;
  schedule: string;
  command: string;
  user: string;
  enabled: boolean;
}

function parseCronFile(file: string, content: string): CronJob | null {
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) return null;
  const parts = lines[0]?.split(/\s+/) ?? [];
  if (parts.length < 6) return null;
  const [schedule, user, ...command] = parts;
  return {
    name: file,
    schedule: schedule ?? '',
    user: user ?? '',
    command: command.join(' '),
    enabled: true,
  };
}

function validateJobInput(payload: Record<string, unknown>, existing?: CronJob): CronJob {
  const name = typeof payload.name === 'string' ? payload.name.trim() : existing?.name ?? '';
  if (!NAME_RE.test(name)) throw new Error('Nom invalide (doit commencer par homeserver-, alphanumérique/-/_ , 50 max.)');
  const schedule = typeof payload.schedule === 'string' ? payload.schedule.trim() : existing?.schedule ?? '';
  if (!SCHEDULE_RE.test(schedule)) throw new Error('Planification invalide (cron 5 champs ou @daily/@hourly/@weekly/@monthly/@reboot)');
  const user = typeof payload.user === 'string' ? payload.user.trim() : existing?.user ?? 'root';
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user)) throw new Error('Utilisateur invalide');
  const command = typeof payload.command === 'string' ? payload.command.trim() : existing?.command ?? '';
  if (command.length === 0 || command.length > 500) throw new Error('Commande requise (500 max.)');
  if (/&&|\|\||;|\brm\s+-rf\s+\//.test(command)) throw new Error('Commande contenant des opérateurs dangereux');
  if (/>\s*\/(etc|var\/lib|usr)\b/.test(command)) throw new Error('Redirection interdite hors /var/www et /var/backups');
  return { name, schedule, user, command, enabled: true };
}

function renderCron(job: CronJob): string {
  return `${job.schedule} ${job.user} ${job.command}\n`;
}

const definition: ModuleDefinition = {
  name: 'cron',
  prefix: 'cron',
  actions: {
    'jobs.list': {
      summary: 'Lister les tâches cron du panel (/etc/cron.d/homeserver-*)',
      handler: async () => {
        const res = await callHelper<{ entries: DirEntryInfo[] }>({ action: 'list_dir', path: CRON_DIR });
        const files = (res.entries ?? []).filter((e) => e.type === 'file' && NAME_RE.test(e.name));
        const jobs = await Promise.all(files.map(async (e) => {
          const content = await callHelper<{ content: string }>({ action: 'read_file', path: `${CRON_DIR}/${e.name}` });
          return parseCronFile(e.name, content.content);
        }));
        return { jobs: jobs.filter((j): j is CronJob => j !== null) };
      },
    },
    'jobs.get': {
      summary: 'Détail d\'une tâche (payload: { name })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const name = typeof p.name === 'string' ? p.name : '';
        if (!NAME_RE.test(name)) throw new Error('Nom invalide');
        const res = await callHelper<{ content: string }>({ action: 'read_file', path: `${CRON_DIR}/${name}` });
        const job = parseCronFile(name, res.content);
        if (!job) throw new Error('Tâche illisible');
        return job;
      },
    },
    'jobs.create': {
      summary: 'Créer une tâche (payload: { name, schedule, user?, command })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const job = validateJobInput(p);
        await callHelper({ action: 'cron_write', file: job.name, content: renderCron(job) });
        return { name: job.name, created: true };
      },
    },
    'jobs.delete': {
      summary: 'Supprimer une tâche (payload: { name })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const name = typeof p.name === 'string' ? p.name : '';
        if (!NAME_RE.test(name)) throw new Error('Nom invalide');
        await callHelper({ action: 'cron_delete', file: name });
        return { name, deleted: true };
      },
    },
  },
};

if (!parentPort) throw new Error('cron worker must run in a worker thread');
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
