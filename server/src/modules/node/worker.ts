import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';

interface NodeApp {
  name: string;
  port: number;
  user: string;
  active: boolean;
}

const APP_RE = /^hs-app-[a-z0-9][a-z0-9-]{0,40}$/;
const ENTRY_RE = /^[A-Za-z0-9._/-]{1,200}\.js$/;

function validateAppName(payload: Record<string, unknown>): string {
  const name = typeof payload.name === 'string' ? payload.name.trim().toLowerCase() : '';
  if (!APP_RE.test(name)) throw new Error('Nom invalide (doit commencer par hs-app-, minuscules/chiffres/-, 47 max.)');
  return name;
}

function validatePort(payload: Record<string, unknown>): number {
  const port = typeof payload.port === 'number' && Number.isInteger(payload.port) ? payload.port : 0;
  if (port < 1024 || port > 65535) throw new Error('Port invalide (1024-65535, ports privilégiés interdits)');
  return port;
}

const definition: ModuleDefinition = {
  name: 'node',
  prefix: 'node',
  actions: {
    'apps.list': {
      summary: 'Lister les applications Node hébergées (services hs-app-*)',
      handler: () => callHelper<{ apps: NodeApp[] }>({ action: 'node_app_list' }),
    },
    'apps.create': {
      summary: 'Créer une app Node : service systemd + port dédié (payload: { name, port, user, entry }). Le code doit être dans /var/www/apps/<name>',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const name = validateAppName(p);
        const port = validatePort(p);
        const user = typeof p.user === 'string' ? p.user.trim() : '';
        if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user)) throw new Error('Utilisateur invalide');
        const entry = typeof p.entry === 'string' ? p.entry.trim() : '';
        if (!ENTRY_RE.test(entry)) throw new Error('Point d\'entrée invalide (chemin .js relatif)');
        const check = await callHelper<{ port: number; free: boolean; checked?: boolean }>({ action: 'port_check', port });
        if (check.checked !== false && !check.free) throw new Error(`Port ${port} déjà utilisé`);
        return callHelper<{ name: string; port: number; created: boolean; started?: boolean; warning?: string }>({ action: 'node_app_create', name, port, user, entry });
      },
    },
    'apps.delete': {
      summary: 'Supprimer une app Node (service uniquement, code conservé) (payload: { name })',
      handler: (payload) => {
        const name = validateAppName((payload ?? {}) as Record<string, unknown>);
        return callHelper({ action: 'node_app_delete', name });
      },
    },
    'apps.service': {
      summary: 'start/stop/restart/status d\'une app (payload: { name, verb })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const name = validateAppName(p);
        const verb = p.verb === 'stop' ? 'stop' : p.verb === 'restart' ? 'restart' : p.verb === 'status' ? 'status' : 'start';
        return callHelper({ action: 'node_app_service', name, verb });
      },
    },
    'ports.check': {
      summary: 'Vérifier si un port est libre (payload: { port })',
      handler: (payload) => {
        const port = validatePort((payload ?? {}) as Record<string, unknown>);
        return callHelper<{ port: number; free: boolean }>({ action: 'port_check', port });
      },
    },
  },
};

if (!parentPort) throw new Error('node worker must run in a worker thread');
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
