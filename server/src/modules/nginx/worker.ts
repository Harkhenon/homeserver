import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { DirEntryInfo, ServiceStatusResult } from '../../core/privileged/contract.js';

const SITES_AVAILABLE = '/etc/nginx/sites-available';
const SITES_ENABLED = '/etc/nginx/sites-enabled';
const SITE_FILE_RE = /^[A-Za-z0-9._-]{1,100}\.conf$/;
const BASE_SITES = new Set(['000-default', '000-default.conf', 'default', 'default.conf', 'default-ssl', 'default-ssl.conf']);
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

interface NginxVhost {
  id: string;
  domain: string;
  docroot: string;
  enabled: boolean;
  aliases: string[];
  ssl: boolean;
  phpVersion: string | null;
  nodePort: number | null;
  confFile: string;
}

function parseVhost(site: string, content: string, enabled: boolean): NginxVhost {
  const id = site.replace(/\.conf$/, '');
  const domain = content.match(/server_name\s+([^;]+)/i)?.[1]?.trim().split(/\s+/)[0] ?? id;
  const docroot = content.match(/root\s+([^;]+)/i)?.[1]?.trim() ?? '';
  const serverNames = (content.match(/server_name\s+([^;]+)/i)?.[1] ?? '').trim().split(/\s+/);
  const ssl = /listen\s+443/i.test(content) || /ssl_certificate/i.test(content);
  const phpMatch = content.match(/php(\d)\.(\d)-fpm\.sock/i);
  const nodeMatch = content.match(/proxy_pass\s+http:\/\/127\.0\.0\.1:(\d+)/i);
  return {
    id,
    domain,
    docroot,
    enabled,
    aliases: serverNames.slice(1),
    ssl,
    phpVersion: phpMatch ? `${phpMatch[1]}.${phpMatch[2]}` : null,
    nodePort: nodeMatch ? Number(nodeMatch[1]) : null,
    confFile: site,
  };
}

function renderVhost(input: {
  domain: string;
  aliases: string[];
  docroot: string;
  phpVersion: string | null;
  nodePort: number | null;
  ssl: boolean;
}): string {
  const serverNames = [input.domain, ...input.aliases].join(' ');
  const phpBlock = input.phpVersion
    ? `
    location ~ \\.php$ {
      include snippets/fastcgi-php.conf;
      fastcgi_pass unix:/run/php/php${input.phpVersion}-fpm.sock;
    }
` : '';
  const proxyBlock = input.nodePort
    ? `
    location / {
      proxy_pass http://127.0.0.1:${input.nodePort};
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
    }
` : '';
  const staticRoot = !input.nodePort && input.docroot
    ? `
    root ${input.docroot};
    index index.html index.htm index.php;

    location / {
      try_files $uri $uri/ =404;
    }
${phpBlock}` : '';
  const sslBlock = input.ssl
    ? `
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/${input.domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${input.domain}/privkey.pem;
` : '';
  return `server {
    listen 80;
${sslBlock}    server_name ${serverNames};
${staticRoot}${proxyBlock}
    access_log /var/log/nginx/${input.domain}.access.log;
    error_log /var/log/nginx/${input.domain}.error.log;
}
`;
}

async function listEnabled(): Promise<Set<string>> {
  try {
    const res = await callHelper<{ entries: DirEntryInfo[] }>({ action: 'list_dir', path: SITES_ENABLED });
    return new Set((res.entries ?? []).map((e) => e.name));
  } catch {
    return new Set();
  }
}

async function readSite(site: string): Promise<string> {
  const res = await callHelper<{ content: string }>({ action: 'read_file', path: `${SITES_AVAILABLE}/${site}` });
  return res.content;
}

function validateVhostInput(payload: Record<string, unknown>): { domain: string; aliases: string[]; docroot: string; phpVersion: string | null; nodePort: number | null; ssl: boolean } {
  const domain = typeof payload.domain === 'string' ? payload.domain.trim().toLowerCase() : '';
  if (!DOMAIN_RE.test(domain)) throw new Error('Domaine invalide');
  const docroot = typeof payload.docroot === 'string' ? payload.docroot.trim() : '';
  if (!docroot.startsWith('/') || docroot.includes('..')) throw new Error('DocumentRoot invalide');
  const aliases = Array.isArray(payload.aliases)
    ? payload.aliases.filter((a): a is string => typeof a === 'string').map((a) => a.trim().toLowerCase()).filter((a) => DOMAIN_RE.test(a))
    : [];
  const phpVersion = typeof payload.phpVersion === 'string' && /^\d\.\d$/.test(payload.phpVersion) ? payload.phpVersion : null;
  const nodePort = typeof payload.nodePort === 'number' && Number.isInteger(payload.nodePort) && payload.nodePort >= 1024 && payload.nodePort <= 65535 ? payload.nodePort : null;
  if (nodePort !== null && (phpVersion !== null || docroot === '')) throw new Error('Mode proxy Node : ni PHP ni docroot requis mutuellement exclusifs — nodePort seul suffit');
  const ssl = payload.ssl === true;
  return { domain, aliases, docroot, phpVersion, nodePort, ssl };
}

async function listVhosts(): Promise<NginxVhost[]> {
  const enabled = await listEnabled();
  const res = await callHelper<{ entries: DirEntryInfo[] }>({ action: 'list_dir', path: SITES_AVAILABLE });
  const files = (res.entries ?? []).filter((e) => e.type === 'file' && SITE_FILE_RE.test(e.name) && !BASE_SITES.has(e.name));
  return Promise.all(files.map(async (e) => parseVhost(e.name, await readSite(e.name), enabled.has(e.name))));
}

const definition: ModuleDefinition = {
  name: 'nginx',
  prefix: 'nginx',
  actions: {
    'vhosts.list': {
      summary: 'Lister les virtualhosts Nginx',
      handler: () => listVhosts(),
    },
    'vhosts.get': {
      summary: 'Détail d\'un virtualhost (payload: { id })',
      handler: async (payload) => {
        const { id } = (payload ?? {}) as { id?: unknown };
        if (typeof id !== 'string') throw new Error('id requis');
        const site = id.endsWith('.conf') ? id : `${id}.conf`;
        const enabled = await listEnabled();
        const content = await readSite(site);
        return { ...parseVhost(site, content, enabled.has(site)), config: content };
      },
    },
    'vhosts.create': {
      summary: 'Créer un vhost (payload: { domain, docroot, aliases?, phpVersion?, nodePort?, ssl?, enable? }) — nodePort = proxy vers app Node',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const input = validateVhostInput(p);
        const enable = p.enable !== false;
        const site = `${input.domain}.conf`;
        const enabled = await listEnabled();
        if (enabled.size >= 0) {
          try { await readSite(site); throw new Error(`Un virtualhost ${input.domain} existe déjà`); } catch (e) {
            if ((e as Error).message.includes('existe déjà')) throw e;
          }
        }
        const content = renderVhost(input);
        await callHelper({ action: 'write_config', path: `${SITES_AVAILABLE}/${site}`, content });
        if (enable) await callHelper({ action: 'site_enable', site, enable: true, web: 'nginx' });
        await callHelper({ action: 'systemctl', unit: 'nginx', verb: 'reload' }).catch(() => {});
        return { id: input.domain, enabled: enable, nodePort: input.nodePort };
      },
    },
    'vhosts.delete': {
      summary: 'Supprimer un virtualhost (payload: { id })',
      handler: async (payload) => {
        const { id } = (payload ?? {}) as { id?: unknown };
        if (typeof id !== 'string') throw new Error('id requis');
        const site = id.endsWith('.conf') ? id : `${id}.conf`;
        if (!SITE_FILE_RE.test(site)) throw new Error('Nom de fichier invalide');
        await callHelper({ action: 'site_enable', site, enable: false, web: 'nginx' });
        await callHelper({ action: 'unlink', path: `${SITES_AVAILABLE}/${site}` });
        return { id, deleted: true };
      },
    },
    'service.status': {
      summary: 'État du service Nginx (systemctl)',
      handler: () => callHelper<ServiceStatusResult>({ action: 'systemctl', unit: 'nginx', verb: 'status' }),
    },
    'service.reload': {
      summary: 'Recharger la configuration Nginx',
      handler: async () => {
        await callHelper({ action: 'systemctl', unit: 'nginx', verb: 'reload' });
        return { reloaded: true };
      },
    },
  },
};

if (!parentPort) throw new Error('nginx worker must run in a worker thread');
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
