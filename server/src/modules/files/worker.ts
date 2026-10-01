import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { FsEntry } from '../../core/privileged/contract.js';

const ROOT = '/var/www';
const PATH_RE = /^\/var\/www(\/[A-Za-z0-9._@ -]+)*\/?$/;

function validatePath(input: unknown): string {
  const p = typeof input === 'string' ? input : '';
  const path = p.replace(/\/+$/, '') || ROOT;
  if (path !== ROOT && !PATH_RE.test(path)) throw new Error('Chemin invalide (limité à /var/www)');
  if (path.includes('..')) throw new Error('Chemin interdit');
  return path;
}

const definition: ModuleDefinition = {
  name: 'files',
  prefix: 'files',
  actions: {
    'files.list': {
      summary: 'Lister un répertoire sous /var/www (payload: { path })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const path = validatePath(p.path);
        const res = await callHelper<{ entries: FsEntry[] }>({ action: 'fs_list', path });
        return { path, entries: (res.entries ?? []).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)) };
      },
    },
    'files.read': {
      summary: 'Lire un fichier texte sous /var/www (payload: { path })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const path = validatePath(p.path);
        if (path === ROOT) throw new Error('Chemin doit désigner un fichier');
        const res = await callHelper<{ content: string }>({ action: 'fs_read', path });
        return { path, content: res.content };
      },
    },
    'files.write': {
      summary: 'Écrire un fichier texte sous /var/www (payload: { path, content })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const path = validatePath(p.path);
        if (path === ROOT) throw new Error('Chemin doit désigner un fichier');
        if (typeof p.content !== 'string') throw new Error('content requis');
        return callHelper({ action: 'fs_write', path, content: p.content });
      },
    },
    'files.mkdir': {
      summary: 'Créer un répertoire sous /var/www (payload: { path })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const path = validatePath(p.path);
        if (path === ROOT) throw new Error('Chemin doit désigner un sous-répertoire');
        return callHelper({ action: 'fs_mkdir', path });
      },
    },
    'files.delete': {
      summary: 'Supprimer un fichier ou répertoire sous /var/www (payload: { path })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const path = validatePath(p.path);
        if (path === ROOT) throw new Error('Interdit de supprimer /var/www');
        return callHelper({ action: 'fs_delete', path });
      },
    },
    'files.chown': {
      summary: 'Change le propriétaire d\'un chemin (payload: { path, owner, group, recursive })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const path = validatePath(p.path);
        const owner = typeof p.owner === 'string' ? p.owner : '';
        const group = typeof p.group === 'string' ? p.group : owner;
        if (!owner) throw new Error('owner requis');
        return callHelper({ action: 'fs_chown', path, owner, group, recursive: p.recursive === true });
      },
    },
  },
};

if (!parentPort) throw new Error('files worker must run in a worker thread');
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
