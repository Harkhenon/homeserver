import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { ServiceStatusResult } from '../../core/privileged/contract.js';

const DB_NAME_RE = /^[a-zA-Z0-9_]{1,64}$/;
const DB_USER_RE = /^[a-zA-Z0-9_]{1,32}$/;
const SYSTEM_DBS = ['mysql', 'information_schema', 'performance_schema', 'sys'];

function validateDbName(payload: Record<string, unknown>): string {
  const name = typeof payload.database === 'string' ? payload.database.trim() : '';
  if (!DB_NAME_RE.test(name)) throw new Error('Nom de base invalide (alphanumérique et _ , 64 max.)');
  if (SYSTEM_DBS.includes(name)) throw new Error('Base système protégée');
  return name;
}

function validateDbUser(payload: Record<string, unknown>): string {
  const name = typeof payload.username === 'string' ? payload.username.trim() : '';
  if (!DB_USER_RE.test(name)) throw new Error('Nom d\'utilisateur invalide (alphanumérique et _ , 32 max.)');
  if (name === 'root') throw new Error('Utilisateur root protégé');
  return name;
}

function validatePassword(payload: Record<string, unknown>): string {
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (password.length < 8) throw new Error('Mot de passe trop court (8 min.)');
  return password;
}

const definition: ModuleDefinition = {
  name: 'mariadb',
  prefix: 'mariadb',
  actions: {
    'dbs.list': {
      summary: 'Lister les bases de données (système exclu)',
      handler: async () => {
        const res = await callHelper<{ databases: string[] }>({ action: 'db_query', sql: 'list_databases' });
        return res;
      },
    },
    'dbs.size': {
      summary: 'Taille d\'une base en Mo (payload: { database })',
      handler: (payload) => {
        const database = validateDbName((payload ?? {}) as Record<string, unknown>);
        return callHelper<{ database: string; sizeMb: number }>({ action: 'db_query', sql: 'db_size', arg: database });
      },
    },
    'dbs.create': {
      summary: 'Créer une base (utf8mb4) (payload: { database })',
      handler: (payload) => {
        const database = validateDbName((payload ?? {}) as Record<string, unknown>);
        return callHelper({ action: 'db_admin', op: 'create_db', database });
      },
    },
    'dbs.delete': {
      summary: 'Supprimer une base (payload: { database })',
      handler: (payload) => {
        const database = validateDbName((payload ?? {}) as Record<string, unknown>);
        return callHelper({ action: 'db_admin', op: 'drop_db', database });
      },
    },
    'users.list': {
      summary: 'Lister les utilisateurs MySQL (root exclu)',
      handler: () => callHelper<{ users: Array<{ user: string; host: string }> }>({ action: 'db_query', sql: 'list_users' }),
    },
    'users.create': {
      summary: 'Créer un utilisateur (payload: { username, password })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const username = validateDbUser(p);
        const password = validatePassword(p);
        return callHelper({ action: 'db_admin', op: 'create_user', username, password });
      },
    },
    'users.delete': {
      summary: 'Supprimer un utilisateur (payload: { username })',
      handler: (payload) => {
        const username = validateDbUser((payload ?? {}) as Record<string, unknown>);
        return callHelper({ action: 'db_admin', op: 'drop_user', username });
      },
    },
    'users.setPassword': {
      summary: 'Changer le mot de passe d\'un utilisateur (payload: { username, password })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const username = validateDbUser(p);
        const password = validatePassword(p);
        return callHelper({ action: 'db_admin', op: 'set_password', username, password });
      },
    },
    'grants.list': {
      summary: 'Lister les privilèges par base/utilisateur',
      handler: () => callHelper<{ grants: Array<{ user: string; host: string; database: string; privilege: string }> }>({ action: 'db_query', sql: 'list_grants' }),
    },
    'grants.grant': {
      summary: 'Donner tous les droits sur une base à un utilisateur (payload: { database, username })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const database = validateDbName(p);
        const username = validateDbUser(p);
        return callHelper({ action: 'db_admin', op: 'grant', database, username });
      },
    },
    'grants.revoke': {
      summary: 'Retirer les droits sur une base (payload: { database, username })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const database = validateDbName(p);
        const username = validateDbUser(p);
        return callHelper({ action: 'db_admin', op: 'revoke', database, username });
      },
    },
    'service.status': {
      summary: 'État du service MariaDB (systemctl)',
      handler: () => callHelper<ServiceStatusResult>({ action: 'systemctl', unit: 'mariadb', verb: 'status' }),
    },
    'service.restart': {
      summary: 'Redémarrer MariaDB (systemctl)',
      handler: async () => {
        await callHelper({ action: 'systemctl', unit: 'mariadb', verb: 'restart' });
        return { restarted: true };
      },
    },
  },
};

if (!parentPort) throw new Error('mariadb worker must run in a worker thread');
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
