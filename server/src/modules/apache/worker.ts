import { parentPort } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { DirEntryInfo, ServiceStatusResult } from '../../core/privileged/contract.js';
import { platform } from '../../core/platform/index.js';

interface Vhost {
  id: string;
  domain: string;
  docroot: string;
  enabled: boolean;
  aliases: string[];
  ssl: boolean;
  phpVersion: string | null;
  serverAdmin: string | null;
  nodePort: number | null;
  confFile: string | null;
}

const APACHE_UNIT = platform.serviceName('apache') as 'apache2' | 'httpd';

function layout(): 'debian' | 'rhel' {
  return existsSync('/etc/apache2/sites-available') ? 'debian' : 'rhel';
}

function sitesAvailableDir(): string {
  return layout() === 'debian' ? '/etc/apache2/sites-available' : '/etc/httpd/sites-available';
}

function confPath(site: string): string {
  return `${sitesAvailableDir()}/${site}`;
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const SITE_FILE_RE = /^[A-Za-z0-9._-]{1,100}\.conf$/;

function parseVhostConf(site: string, content: string, enabled: boolean): Vhost {
  const id = site.replace(/\.conf$/, '');
  const domain = content.match(/ServerName\s+(\S+)/i)?.[1] ?? id;
  const docroot = content.match(/DocumentRoot\s+(\S+)/i)?.[1] ?? '';
  const serverAdmin = content.match(/ServerAdmin\s+(\S+)/i)?.[1] ?? null;
  const aliases = [
    ...(content.matchAll(/ServerAlias\s+(.+)/gi) ?? []),
  ].flatMap((m) => String(m[1]).trim().split(/\s+/));
  const ssl = /<VirtualHost[^>]*:443>/i.test(content) || /SSLEngine\s+on/i.test(content);
  const nodePort = Number(content.match(/ProxyPass\s+\/\s+http:\/\/127\.0\.0\.1:(\d+)/i)?.[1] ?? 0) || null;
  const phpMatch = content.match(/php(\d)\.(\d)-fpm\.sock/i) ?? content.match(/proxy:unix\/run\/php\/php(\d)\.(\d)-fpm/);
  const phpVersion = phpMatch ? `${phpMatch[1]}.${phpMatch[2]}` : null;
  return {
    id,
    domain,
    docroot,
    enabled,
    aliases,
    ssl,
    phpVersion,
    nodePort,
    serverAdmin,
    confFile: site,
  };
}

async function listEnabledSites(): Promise<Set<string>> {
  try {
    const dir = layout() === 'debian' ? '/etc/apache2/sites-enabled' : '/etc/httpd/sites-enabled';
    const res = await callHelper<{ entries: DirEntryInfo[] }>({ action: 'list_dir', path: dir });
    return new Set((res.entries ?? []).map((e) => e.name));
  } catch {
    return new Set();
  }
}

async function readSite(site: string): Promise<string> {
  const res = await callHelper<{ content: string }>({ action: 'read_file', path: confPath(site) });
  return res.content;
}

function renderVhostConf(input: {
  domain: string;
  aliases: string[];
  docroot: string;
  serverAdmin: string | null;
  phpVersion: string | null;
  nodePort: number | null;
  ssl: boolean;
}): string {
  const serverAlias = input.aliases.length > 0 ? `  ServerAlias ${input.aliases.join(' ')}\n` : '';
  const admin = input.serverAdmin ? `  ServerAdmin ${input.serverAdmin}\n` : '';
  const phpBlock = input.phpVersion
    ? `
  <FilesMatch \\.php$>
    <If "-f %{REQUEST_FILENAME}">
      SetHandler "proxy:unix:/run/php/php${input.phpVersion}-fpm.sock|fcgi://localhost"
    </If>
  </FilesMatch>
`
    : '';
  const proxyBlock = input.nodePort
    ? `
  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:${input.nodePort}/
  ProxyPassReverse / http://127.0.0.1:${input.nodePort}/
`
    : '';
  const dirBlock = input.docroot
    ? `
  DocumentRoot ${input.docroot}

  <Directory ${input.docroot}>
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted
  </Directory>
`
    : '';
  const base = `<VirtualHost *:80>
  ServerName ${input.domain}
${serverAlias}${admin}${dirBlock}${phpBlock}${proxyBlock}
  ErrorLog \${APACHE_LOG_DIR}/error.log
  CustomLog \${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
`;
  if (!input.ssl) return base;
  return base + `
<VirtualHost *:443>
  ServerName ${input.domain}
${serverAlias}${admin}  DocumentRoot ${input.docroot}

  SSLEngine on
  SSLCertificateFile /etc/letsencrypt/live/${input.domain}/fullchain.pem
  SSLCertificateKeyFile /etc/letsencrypt/live/${input.domain}/privkey.pem

  <Directory ${input.docroot}>
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted
  </Directory>
${phpBlock}
  ErrorLog \${APACHE_LOG_DIR}/error.log
  CustomLog \${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
`;
}

async function listVhosts(): Promise<Vhost[]> {
  const enabled = await listEnabledSites();
  const res = await callHelper<{ entries: DirEntryInfo[] }>({ action: 'list_dir', path: sitesAvailableDir() });
  const files = (res.entries ?? []).filter((e) => e.type === 'file' && SITE_FILE_RE.test(e.name));
  const vhosts = await Promise.all(files.map(async (e) => {
    const content = await readSite(e.name).catch(() => '');
    return parseVhostConf(e.name, content, enabled.has(e.name));
  }));
  return vhosts;
}

function validateVhostInput(payload: unknown): { domain: string; aliases: string[]; docroot: string; serverAdmin: string | null; phpVersion: string | null; nodePort: number | null; ssl: boolean } {
  const p = (payload ?? {}) as Record<string, unknown>;
  const domain = typeof p.domain === 'string' ? p.domain.trim().toLowerCase() : '';
  if (!DOMAIN_RE.test(domain)) throw new Error('Domaine invalide');
  const docroot = typeof p.docroot === 'string' ? p.docroot.trim() : '';
  if (!docroot.startsWith('/') || docroot.includes('..')) throw new Error('DocumentRoot invalide');
  const aliases = Array.isArray(p.aliases)
    ? p.aliases.filter((a): a is string => typeof a === 'string').map((a) => a.trim().toLowerCase()).filter((a) => DOMAIN_RE.test(a))
    : [];
  const serverAdmin = typeof p.serverAdmin === 'string' && p.serverAdmin.includes('@') ? p.serverAdmin.trim() : null;
  const phpVersion = typeof p.phpVersion === 'string' && /^\d\.\d$/.test(p.phpVersion) ? p.phpVersion : null;
  const ssl = p.ssl === true;
  const nodePort = typeof p.nodePort === 'number' && Number.isInteger(p.nodePort) && p.nodePort >= 1024 && p.nodePort <= 65535 ? p.nodePort : null;
  if (nodePort !== null && !docroot) throw new Error('Proxy Node : docroot requis en secours ou omis, mais domain valide obligatoire');
  return { domain, aliases, docroot, serverAdmin, phpVersion, nodePort, ssl };
}

async function serviceStatus(): Promise<ServiceStatusResult> {
  return callHelper<ServiceStatusResult>({ action: 'systemctl', unit: APACHE_UNIT, verb: 'status' });
}

const definition: ModuleDefinition = {
  name: 'apache',
  prefix: 'apache',
  actions: {
    'vhosts.list': {
      summary: 'Lister les virtualhosts (lecture réelle de sites-available)',
      handler: () => listVhosts(),
    },
    'vhosts.get': {
      summary: 'Détail d\'un virtualhost (payload: { id })',
      handler: async (payload) => {
        const { id } = (payload ?? {}) as { id?: unknown };
        if (typeof id !== 'string') throw new Error('id requis');
        const site = id.endsWith('.conf') ? id : `${id}.conf`;
        const enabled = await listEnabledSites();
        const content = await readSite(site);
        return { ...parseVhostConf(site, content, enabled.has(site)), config: content };
      },
    },
    'vhosts.create': {
      summary: 'Créer un virtualhost (payload: { domain, docroot, aliases?, serverAdmin?, phpVersion?, ssl?, enable? })',
      handler: async (payload) => {
        const input = validateVhostInput(payload);
        const enable = (payload as { enable?: unknown } | undefined)?.enable !== false;
        const site = `${input.domain}.conf`;
        if (existsSync(confPath(site))) throw new Error(`Un virtualhost ${input.domain} existe déjà`);
        const content = renderVhostConf(input);
        await callHelper({ action: 'write_config', path: confPath(site), content });
        if (enable) await callHelper({ action: 'site_enable', site, enable: true, web: 'apache' as const });
        return { id: input.domain, enabled: enable, confFile: site };
      },
    },
    'vhosts.update': {
      summary: 'Mettre à jour un virtualhost (payload: { id, ...champs })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const id = typeof p.id === 'string' ? p.id : '';
        if (!id) throw new Error('id requis');
        const site = id.endsWith('.conf') ? id : `${id}.conf`;
        const enabled = await listEnabledSites();
        const oldContent = await readSite(site);
        const old = parseVhostConf(site, oldContent, enabled.has(site));
        const input = validateVhostInput({ domain: p.domain ?? old.domain, aliases: p.aliases ?? old.aliases, docroot: p.docroot ?? old.docroot, serverAdmin: p.serverAdmin ?? old.serverAdmin, phpVersion: p.phpVersion ?? old.phpVersion, nodePort: p.nodePort ?? old.nodePort, ssl: p.ssl ?? old.ssl });
        const content = renderVhostConf(input);
        await callHelper({ action: 'write_config', path: confPath(site), content });
        return { id: old.id, updated: true };
      },
    },
    'vhosts.enable': {
      summary: 'Activer/désactiver un virtualhost (payload: { id, enabled })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const id = typeof p.id === 'string' ? p.id : '';
        if (!id) throw new Error('id requis');
        const site = id.endsWith('.conf') ? id : `${id}.conf`;
        const enabled = p.enabled !== false;
        await callHelper({ action: 'site_enable', site, enable: enabled, web: 'apache' as const });
        return { id, enabled };
      },
    },
    'vhosts.delete': {
      summary: 'Supprimer un virtualhost (payload: { id, keepEnabled? })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const id = typeof p.id === 'string' ? p.id : '';
        if (!id) throw new Error('id requis');
        const site = id.endsWith('.conf') ? id : `${id}.conf`;
        if (!SITE_FILE_RE.test(site)) throw new Error('Nom de fichier invalide');
        await callHelper({ action: 'site_enable', site, enable: false, web: 'apache' as const });
        await callHelper({ action: 'unlink', path: confPath(site) });
        return { id, deleted: true };
      },
    },
    'service.status': {
      summary: 'État réel du service Apache (systemctl)',
      handler: () => serviceStatus(),
    },
    'service.restart': {
      summary: 'Redémarrer Apache (systemctl via helper)',
      handler: async () => {
        await callHelper({ action: 'systemctl', unit: APACHE_UNIT, verb: 'restart' });
        return { restarted: true, ...(await serviceStatus()) };
      },
    },
    'service.reload': {
      summary: 'Recharger la configuration Apache',
      handler: async () => {
        await callHelper({ action: 'systemctl', unit: APACHE_UNIT, verb: 'reload' });
        return { reloaded: true };
      },
    },
  },
};

if (!parentPort) throw new Error('apache worker must run in a worker thread');
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
