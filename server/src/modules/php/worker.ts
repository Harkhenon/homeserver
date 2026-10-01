import { parentPort } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { DirEntryInfo, ServiceStatusResult } from '../../core/privileged/contract.js';

interface PoolConfig {
  name: string;
  phpVersion: string;
  user: string;
  group: string;
  listen: string;
  pm: string;
  pmMaxChildren: number;
  pmStartServers: number;
  pmMinSpareServers: number;
  pmMaxSpareServers: number;
  phpValues: Record<string, string>;
}

function poolDir(version: string): string {
  if (existsSync('/etc/php')) return `/etc/php/${version}/fpm/pool.d`;
  return '/etc/php-fpm.d';
}

function poolPath(version: string, name: string): string {
  return `${poolDir(version)}/${name}.conf`;
}

function renderPool(p: PoolConfig): string {
  const phpLines = Object.entries(p.phpValues).map(([k, v]) => `php_admin_value[${k}] = ${v}`);
  return `[${p.name}]
user = ${p.user}
group = ${p.group}
listen = /run/php/php${p.phpVersion}-fpm-${p.name}.sock
listen.owner = www-data
listen.group = www-data
pm = ${p.pm}
pm.max_children = ${p.pmMaxChildren}
pm.start_servers = ${p.pmStartServers}
pm.min_spare_servers = ${p.pmMinSpareServers}
pm.max_spare_servers = ${p.pmMaxSpareServers}
${phpLines.join('\n')}
`;
}

function parsePool(content: string, file: string, version: string): PoolConfig {
  const get = (key: string): string => content.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? '';
  const name = content.match(/^\[(.+)\]/m)?.[1] ?? file.replace(/\.conf$/, '');
  const phpValues: Record<string, string> = {};
  for (const m of content.matchAll(/^php_admin_value\[(.+?)\]\s*=\s*(.+)$/gmi)) {
    phpValues[String(m[1])] = String(m[2]).trim();
  }
  return {
    name,
    phpVersion: version,
    user: get('user'),
    group: get('group'),
    listen: get('listen'),
    pm: get('pm') || 'dynamic',
    pmMaxChildren: Number(get('pm.max_children')) || 5,
    pmStartServers: Number(get('pm.start_servers')) || 2,
    pmMinSpareServers: Number(get('pm.min_spare_servers')) || 1,
    pmMaxSpareServers: Number(get('pm.max_spare_servers')) || 3,
    phpValues,
  };
}

function validatePoolInput(p: Record<string, unknown>, version: string, existing?: PoolConfig): PoolConfig {
  const name = typeof p.name === 'string' ? p.name.trim().toLowerCase() : existing?.name ?? '';
  if (!/^[a-z0-9][a-z0-9_-]{0,30}$/.test(name)) throw new Error('Nom de pool invalide');
  const user = typeof p.user === 'string' ? p.user : existing?.user ?? '';
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user)) throw new Error('Utilisateur du pool invalide');
  const group = typeof p.group === 'string' ? p.group : existing?.group ?? user;
  const pm = typeof p.pm === 'string' && ['dynamic', 'static', 'ondemand'].includes(p.pm) ? p.pm : existing?.pm ?? 'dynamic';
  const num = (v: unknown, d: number): number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 1000 ? v : d;
  const phpValues: Record<string, string> = {};
  const inputValues = p.phpValues;
  if (inputValues && typeof inputValues === 'object') {
    const allowed = ['memory_limit', 'max_execution_time', 'upload_max_filesize', 'post_max_size', 'display_errors', 'opcache.enable'];
    for (const [k, v] of Object.entries(inputValues as Record<string, unknown>)) {
      if (!allowed.includes(k)) throw new Error(`Clé php_admin_value non autorisée: ${k}`);
      if (typeof v !== 'string' || v.length > 100) throw new Error(`Valeur invalide pour ${k}`);
      phpValues[k] = v;
    }
  }
  return {
    name,
    phpVersion: version,
    user,
    group,
    listen: `/run/php/php${version}-fpm-${name}.sock`,
    pm,
    pmMaxChildren: num(p.pmMaxChildren, existing?.pmMaxChildren ?? 5),
    pmStartServers: num(p.pmStartServers, existing?.pmStartServers ?? 2),
    pmMinSpareServers: num(p.pmMinSpareServers, existing?.pmMinSpareServers ?? 1),
    pmMaxSpareServers: num(p.pmMaxSpareServers, existing?.pmMaxSpareServers ?? 3),
    phpValues,
  };
}

const definition: ModuleDefinition = {
  name: 'php',
  prefix: 'php',
  actions: {
    'versions.list': {
      summary: 'Versions PHP installées/disponibles (détection distro)',
      handler: () => callHelper({ action: 'discover', kind: 'php' }),
    },
    'versions.install': {
      summary: 'Installer une version PHP-FPM (payload: { version })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const version = typeof p.version === 'string' ? p.version.trim() : '';
        if (!/^\d\.\d$/.test(version)) throw new Error('Version invalide (format X.Y)');
        const res = await callHelper<{ family: string; installed: string[] }>({ action: 'install_packages', packages: [`php${version}-fpm`] });
        return { version, installed: true, packages: res.installed };
      },
    },
    'versions.remove': {
      summary: 'Supprimer une version PHP-FPM (payload: { version })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const version = typeof p.version === 'string' ? p.version.trim() : '';
        if (!/^\d\.\d$/.test(version)) throw new Error('Version invalide (format X.Y)');
        await callHelper({ action: 'packages_remove', packages: [`php${version}-fpm`] });
        return { version, removed: true };
      },
    },
    'pools.list': {
      summary: 'Lister les pools FPM d\'une version (payload: { version })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const version = typeof p.version === 'string' ? p.version.trim() : '';
        if (!/^\d\.\d$/.test(version)) throw new Error('Version invalide (format X.Y)');
        const dir = poolDir(version);
        const res = await callHelper<{ entries: DirEntryInfo[] }>({ action: 'list_dir', path: dir });
        const files = (res.entries ?? []).filter((e) => e.type === 'file' && /[A-Za-z0-9._-]+\.conf$/.test(e.name));
        const pools = await Promise.all(files.map(async (e) => {
          const content = await callHelper<{ content: string }>({ action: 'read_file', path: `${dir}/${e.name}` });
          return parsePool(content.content, e.name, version);
        }));
        return pools;
      },
    },
    'pools.get': {
      summary: 'Détail d\'un pool FPM (payload: { version, name })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const version = typeof p.version === 'string' ? p.version.trim() : '';
        if (!/^\d\.\d$/.test(version)) throw new Error('Version invalide (format X.Y)');
        const name = typeof p.name === 'string' ? p.name.trim().toLowerCase() : '';
        if (!/^[a-z0-9][a-z0-9_-]{0,30}$/.test(name)) throw new Error('Nom de pool invalide');
        const res = await callHelper<{ content: string }>({ action: 'read_file', path: poolPath(version, name) });
        return parsePool(res.content, `${name}.conf`, version);
      },
    },
    'pools.create': {
      summary: 'Créer un pool FPM (payload: { version, name, user, group?, pm?, pm*?, phpValues? })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const version = typeof p.version === 'string' ? p.version.trim() : '';
        if (!/^\d\.\d$/.test(version)) throw new Error('Version invalide (format X.Y)');
        const pool = validatePoolInput(p, version);
        await callHelper({ action: 'write_config', path: poolPath(version, pool.name), content: renderPool(pool) });
        await callHelper({ action: 'systemctl', unit: 'php-fpm', verb: 'restart' });
        return { name: pool.name, version, created: true };
      },
    },
    'pools.update': {
      summary: 'Mettre à jour un pool FPM (payload: { version, name, ...champs })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const version = typeof p.version === 'string' ? p.version.trim() : '';
        if (!/^\d\.\d$/.test(version)) throw new Error('Version invalide (format X.Y)');
        const name = typeof p.name === 'string' ? p.name.trim().toLowerCase() : '';
        if (!/^[a-z0-9][a-z0-9_-]{0,30}$/.test(name)) throw new Error('Nom de pool invalide');
        let existing: PoolConfig | undefined;
        try {
          const res = await callHelper<{ content: string }>({ action: 'read_file', path: poolPath(version, name) });
          existing = parsePool(res.content, `${name}.conf`, version);
        } catch { existing = undefined; }
        if (!existing) throw new Error(`Pool introuvable: ${name}`);
        const merged = { ...p, name, user: p.user ?? existing.user, group: p.group ?? existing.group, phpValues: p.phpValues ?? existing.phpValues };
        const pool = validatePoolInput(merged, version, existing);
        await callHelper({ action: 'write_config', path: poolPath(version, pool.name), content: renderPool(pool) });
        await callHelper({ action: 'systemctl', unit: 'php-fpm', verb: 'restart' });
        return { name: pool.name, version, updated: true };
      },
    },
    'pools.delete': {
      summary: 'Supprimer un pool FPM (payload: { version, name })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const version = typeof p.version === 'string' ? p.version.trim() : '';
        if (!/^\d\.\d$/.test(version)) throw new Error('Version invalide (format X.Y)');
        const name = typeof p.name === 'string' ? p.name.trim().toLowerCase() : '';
        if (!/^[a-z0-9][a-z0-9_-]{0,30}$/.test(name)) throw new Error('Nom de pool invalide');
        if (name === 'www') throw new Error('Le pool www par défaut ne peut pas être supprimé');
        await callHelper({ action: 'unlink', path: poolPath(version, name) });
        await callHelper({ action: 'systemctl', unit: 'php-fpm', verb: 'restart' });
        return { name, version, deleted: true };
      },
    },
    'service.status': {
      summary: 'État du service php-fpm (systemctl)',
      handler: () => callHelper<ServiceStatusResult>({ action: 'systemctl', unit: 'php-fpm', verb: 'status' }),
    },
    'service.restart': {
      summary: 'Redémarrer php-fpm (systemctl)',
      handler: async () => {
        await callHelper({ action: 'systemctl', unit: 'php-fpm', verb: 'restart' });
        return { restarted: true };
      },
    },
  },
};

if (!parentPort) throw new Error('php worker must run in a worker thread');
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
