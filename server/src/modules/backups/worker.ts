import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';

const SITE_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;

interface BackupInfo {
  file: string;
  site: string;
  sizeBytes: number;
  createdAt: string;
}

function validateSite(payload: Record<string, unknown>): string {
  const site = typeof payload.site === 'string' ? payload.site.trim().toLowerCase() : '';
  if (!SITE_RE.test(site)) throw new Error('Site invalide');
  return site;
}

const definition: ModuleDefinition = {
  name: 'backups',
  prefix: 'backups',
  actions: {
    'backups.list': {
      summary: 'Lister les sauvegardes (/var/backups/homeserver)',
      handler: () => callHelper<{ backups: BackupInfo[] }>({ action: 'backup_list' }),
    },
    'backups.create': {
      summary: 'Créer une sauvegarde d\'un site (tar.gz de /var/www/<site>) (payload: { site })',
      handler: (payload) => {
        const site = validateSite((payload ?? {}) as Record<string, unknown>);
        return callHelper<BackupInfo>({ action: 'backup_create', site });
      },
    },
    'backups.delete': {
      summary: 'Supprimer une sauvegarde (payload: { file })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const file = typeof p.file === 'string' ? p.file : '';
        if (!/^homeserver-[A-Za-z0-9._-]+\.tar\.gz$/.test(file)) throw new Error('Fichier invalide');
        return callHelper({ action: 'backup_delete', file });
      },
    },
    'backups.restore': {
      summary: 'Restaurer une sauvegarde dans /var/www/<site> (payload: { file, site })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const file = typeof p.file === 'string' ? p.file : '';
        if (!/^homeserver-[A-Za-z0-9._-]+\.tar\.gz$/.test(file)) throw new Error('Fichier invalide');
        const site = validateSite(p);
        return callHelper({ action: 'backup_restore', file, site });
      },
    },
  },
};

if (!parentPort) throw new Error('backups worker must run in a worker thread');
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
