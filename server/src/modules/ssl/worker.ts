import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';

interface CertInfo {
  domain: string;
  subject: string;
  issuer: string;
  expiresAt: string | null;
  daysLeft: number | null;
  autoRenew: boolean;
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i;

function validateDomain(payload: Record<string, unknown>): string {
  const domain = typeof payload.domain === 'string' ? payload.domain.trim().toLowerCase() : '';
  if (!DOMAIN_RE.test(domain)) throw new Error('Domaine invalide');
  return domain;
}

const definition: ModuleDefinition = {
  name: 'ssl',
  prefix: 'ssl',
  actions: {
    'certs.list': {
      summary: 'Lister les certificats Let\'s Encrypt (renouvellements configurés)',
      handler: async () => {
        const res = await callHelper<{ entries: Array<{ name: string; type: string }> }>({ action: 'list_dir', path: '/etc/letsencrypt/renewal' });
        const domains = (res.entries ?? [])
          .filter((e) => e.type === 'file' && e.name.endsWith('.conf'))
          .map((e) => e.name.replace(/\.conf$/, ''));
        return { domains, count: domains.length };
      },
    },
    'certs.info': {
      summary: 'Détail d\'un certificat : expiration, émetteur, renouvellement auto (payload: { domain })',
      handler: (payload) => {
        const domain = validateDomain((payload ?? {}) as Record<string, unknown>);
        return callHelper<CertInfo>({ action: 'cert_info', domain });
      },
    },
    'certs.issue': {
      summary: 'Émettre un certificat Let\'s Encrypt via certbot --apache (payload: { domain, email })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const domain = validateDomain(p);
        const email = typeof p.email === 'string' ? p.email.trim() : '';
        if (!EMAIL_RE.test(email)) throw new Error('Email invalide');
        return callHelper<{ domain: string; issued: boolean; output: string }>({ action: 'cert_issue', domain, email });
      },
    },
    'certs.renew': {
      summary: 'Renouveler un certificat (payload: { domain })',
      handler: (payload) => {
        const domain = validateDomain((payload ?? {}) as Record<string, unknown>);
        return callHelper<{ domain: string; renewed: boolean; output: string }>({ action: 'cert_renew', domain });
      },
    },
  },
};

if (!parentPort) throw new Error('ssl worker must run in a worker thread');
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
