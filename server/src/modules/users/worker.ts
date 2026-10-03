import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { UserInfo } from '../../core/privileged/contract.js';

const USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const SFTP_SHELL = '/usr/sbin/nologin';

function validateUsername(payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const username = typeof p.username === 'string' ? p.username.trim().toLowerCase() : '';
  if (!USERNAME_RE.test(username)) throw new Error('Nom d\'utilisateur invalide (minuscules, chiffres, _ -, début lettre ou _)');
  if (username.length < 3) throw new Error('Nom d\'utilisateur trop court (3 min.)');
  if (['root', 'admin', 'hs', 'www-data', 'daemon', 'nobody', 'sshd'].some((r) => username === r || username.startsWith(`${r}-`))) {
    throw new Error('Nom d\'utilisateur réservé');
  }
  return username;
}

async function listUsers(): Promise<UserInfo[]> {
  const res = await callHelper<{ users: UserInfo[] }>({ action: 'user_list' });
  return res.users;
}

async function assertUserExists(username: string): Promise<void> {
  const users = await listUsers();
  if (!users.some((u) => u.username === username)) throw new Error(`Utilisateur introuvable: ${username}`);
}

const definition: ModuleDefinition = {
  name: 'users',
  prefix: 'users',
  actions: {
    'users.list': {
      summary: 'Lister les utilisateurs SFTP/web gérés par le panel',
      handler: () => listUsers(),
    },
    'users.get': {
      summary: 'Détail d\'un utilisateur (payload: { username })',
      handler: async (payload) => {
        const username = validateUsername(payload);
        const users = await listUsers();
        const user = users.find((u) => u.username === username);
        if (!user) throw new Error(`Utilisateur introuvable: ${username}`);
        return user;
      },
    },
    'users.create': {
      summary: 'Créer un utilisateur (home /home/<user> avec www/ et nodeApps/) (payload: { username, password, shell?, sshKey? })',
      handler: async (payload) => {
        const username = validateUsername(payload);
        const p = (payload ?? {}) as Record<string, unknown>;
        const password = typeof p.password === 'string' ? p.password : '';
        if (password.length < 8) throw new Error('Mot de passe trop court (8 min.)');
        const shell = p.shell === '/bin/bash' ? '/bin/bash' : SFTP_SHELL;
        const users = await listUsers();
        if (users.some((u) => u.username === username)) throw new Error(`L'utilisateur ${username} existe déjà`);
        const home = `/home/${username}`;
        const created = await callHelper<{ username: string; created: boolean }>({
          action: 'user_create',
          username,
          password,
          home,
          shell,
        });
        const sshKey = typeof p.sshKey === 'string' ? p.sshKey.trim() : '';
        if (sshKey) {
          if (sshKey.length < 50 || sshKey.includes('\n')) throw new Error('Clé SSH invalide');
          await callHelper({ action: 'user_ssh_keys_add', username, key: sshKey });
        }
        const sftp = await callHelper<{ configured: boolean; reloaded?: boolean }>({ action: 'sftp_configure' });
        return {
          ...created,
          home,
          sftpOnly: shell === SFTP_SHELL,
          sshKeyInstalled: Boolean(sshKey),
          sftpConfigured: sftp.configured,
          sshReloaded: sftp.reloaded !== false,
        };
      },
    },
    'users.sshKeys': {
      summary: 'Lister les clés SSH d\'un utilisateur (payload: { username })',
      handler: async (payload) => {
        const username = validateUsername(payload);
        await assertUserExists(username);
        return callHelper<{ username: string; keys: string[] }>({ action: 'user_ssh_keys_list', username });
      },
    },
    'users.sshKeys.add': {
      summary: 'Ajouter une clé SSH à un utilisateur (payload: { username, key })',
      handler: async (payload) => {
        const username = validateUsername(payload);
        const p = (payload ?? {}) as Record<string, unknown>;
        const key = typeof p.key === 'string' ? p.key.trim() : '';
        if (key.length < 50) throw new Error('Clé SSH invalide (trop courte)');
        await assertUserExists(username);
        return callHelper({ action: 'user_ssh_keys_add', username, key });
      },
    },
    'users.sshKeys.remove': {
      summary: 'Retirer une clé SSH d\'un utilisateur (payload: { username, index })',
      handler: async (payload) => {
        const username = validateUsername(payload);
        const p = (payload ?? {}) as Record<string, unknown>;
        const index = typeof p.index === 'number' ? p.index : -1;
        if (!Number.isInteger(index) || index < 0) throw new Error('Index de clé invalide');
        await assertUserExists(username);
        return callHelper({ action: 'user_ssh_keys_remove', username, index });
      },
    },
    'users.delete': {
      summary: 'Supprimer un utilisateur (payload: { username, removeHome? })',
      handler: async (payload) => {
        const username = validateUsername(payload);
        const p = (payload ?? {}) as Record<string, unknown>;
        const removeHome = p.removeHome === true;
        const users = await listUsers();
        if (!users.some((u) => u.username === username)) throw new Error(`Utilisateur introuvable: ${username}`);
        await callHelper({ action: 'user_delete', username, removeHome: false });
        return { username, deleted: true, homeRemoved: removeHome };
      },
    },
    'users.setPassword': {
      summary: 'Changer le mot de passe d\'un utilisateur (payload: { username, password })',
      handler: async (payload) => {
        const username = validateUsername(payload);
        const p = (payload ?? {}) as Record<string, unknown>;
        const password = typeof p.password === 'string' ? p.password : '';
        if (password.length < 8) throw new Error('Mot de passe trop court (8 min.)');
        const users = await listUsers();
        if (!users.some((u) => u.username === username)) throw new Error(`Utilisateur introuvable: ${username}`);
        return callHelper({ action: 'user_set_password', username, password });
      },
    },
    'users.setSite': {
      summary: 'Changer le site (chroot) d\'un utilisateur (payload: { username, site })',
      handler: async (payload) => {
        const username = validateUsername(payload);
        const p = (payload ?? {}) as Record<string, unknown>;
        const site = typeof p.site === 'string' ? p.site.trim().toLowerCase() : '';
        if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(site)) throw new Error('Site invalide');
        const users = await listUsers();
        if (!users.some((u) => u.username === username)) throw new Error(`Utilisateur introuvable: ${username}`);
        throw new Error('Non implémenté : usermod via helper requis (prochaine itération)');
      },
    },
  },
};

if (!parentPort) throw new Error('users worker must run in a worker thread');
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
