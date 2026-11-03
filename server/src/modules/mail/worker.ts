import { parentPort } from 'node:worker_threads';
import { randomBytes } from 'node:crypto';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import { validatePasswordPolicy } from '../../core/password-policy.js';
import type { MailStatusResult, MailDomainInfo, MailBoxInfo } from '../../core/privileged/contract.js';

// Le helper revalide tout (contrat) : ici, des messages d'erreur lisibles pour le panel.
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOCAL_RE = /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}$/;
const DISPLAY_NAME_RE = /^[\p{L}\p{N} .'_-]{0,64}$/u;
const DEFAULT_QUOTA_MB = 2048;
const MAX_QUOTA_MB = 10_485_760;

// Installation des paquets : plusieurs minutes sur une petite machine
const SETUP_TIMEOUT_MS = 1_800_000;
const TLS_TIMEOUT_MS = 300_000;
// Un `du` sur de grosses boîtes peut être long
const LIST_TIMEOUT_MS = 300_000;

type Payload = Record<string, unknown>;

function domainOf(p: Payload, key = 'domain'): string {
  const v = typeof p[key] === 'string' ? (p[key] as string).trim().toLowerCase() : '';
  if (!DOMAIN_RE.test(v)) throw new Error('Domaine invalide (ex : exemple.fr)');
  return v;
}

function localOf(p: Payload): string {
  const v = typeof p.local === 'string' ? p.local.trim().toLowerCase() : '';
  if (!LOCAL_RE.test(v) || v.includes('..')) {
    throw new Error('Nom de boîte invalide : lettres, chiffres, . _ - (commence et finit par une lettre ou un chiffre)');
  }
  return v;
}

function quotaOf(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_QUOTA_MB) {
    throw new Error(`${label} invalide (en Mo, 0 = illimité)`);
  }
  return v;
}

function displayNameOf(v: unknown): string {
  const name = typeof v === 'string' ? v.trim() : '';
  if (!DISPLAY_NAME_RE.test(name)) throw new Error('Nom affiché invalide (64 caractères max., sans symboles)');
  return name;
}

function booleanOf(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${label} requis`);
  return v;
}

/** Mot de passe aléatoire conforme à la politique (lettres, chiffres, spéciaux). */
function generatePassword(): string {
  return `${randomBytes(18).toString('base64url')}-A1`;
}

const definition: ModuleDefinition = {
  name: 'mail',
  prefix: 'mail',
  actions: {
    status: {
      summary: 'État du service e-mail (paquets, services, TLS, nombre de boîtes)',
      handler: () => callHelper<MailStatusResult>({ action: 'mail_status' }),
    },
    setup: {
      summary: 'Installer et activer le service e-mail (payload: { hostname })',
      handler: (payload) => {
        const hostname = domainOf((payload ?? {}) as Payload, 'hostname');
        return callHelper<MailStatusResult>({ action: 'mail_setup', hostname }, undefined, SETUP_TIMEOUT_MS);
      },
    },
    'service.set': {
      summary: 'Démarrer ou arrêter le service e-mail, boîtes conservées (payload: { enabled })',
      handler: (payload) => {
        const enabled = booleanOf(((payload ?? {}) as Payload).enabled, 'enabled');
        return callHelper<MailStatusResult>({ action: 'mail_service', enabled });
      },
    },
    'tls.issue': {
      summary: 'Certificat Let\'s Encrypt pour le nom d\'hôte du serveur de mail (payload: { email })',
      handler: (payload) => {
        const email = typeof ((payload ?? {}) as Payload).email === 'string' ? ((payload as Payload).email as string).trim() : '';
        if (!EMAIL_RE.test(email)) throw new Error('Email invalide');
        return callHelper<MailStatusResult>({ action: 'mail_tls_issue', email }, undefined, TLS_TIMEOUT_MS);
      },
    },
    'domains.list': {
      summary: 'Lister les domaines de messagerie',
      handler: () => callHelper<{ domains: MailDomainInfo[] }>({ action: 'mail_domain_list' }),
    },
    'domains.add': {
      summary: 'Activer la messagerie d\'un domaine (payload: { domain, defaultQuotaMb? })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const defaultQuotaMb = p.defaultQuotaMb === undefined ? DEFAULT_QUOTA_MB : quotaOf(p.defaultQuotaMb, 'Quota par défaut');
        return callHelper<MailDomainInfo>({ action: 'mail_domain_add', domain: domainOf(p), defaultQuotaMb });
      },
    },
    'domains.update': {
      summary: 'Suspendre un domaine ou changer son quota par défaut (payload: { domain, suspended?, defaultQuotaMb? })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        return callHelper<MailDomainInfo>({
          action: 'mail_domain_set',
          domain: domainOf(p),
          ...(p.suspended !== undefined ? { suspended: booleanOf(p.suspended, 'suspended') } : {}),
          ...(p.defaultQuotaMb !== undefined ? { defaultQuotaMb: quotaOf(p.defaultQuotaMb, 'Quota par défaut') } : {}),
        });
      },
    },
    'domains.delete': {
      summary: 'Retirer un domaine de messagerie (payload: { domain, deleteData })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        return callHelper<{ deleted: boolean }>({ action: 'mail_domain_remove', domain: domainOf(p), deleteData: booleanOf(p.deleteData, 'deleteData') });
      },
    },
    'boxes.list': {
      summary: 'Lister les boîtes d\'un domaine, avec leur usage (payload: { domain })',
      handler: (payload) => callHelper<{ boxes: MailBoxInfo[] }>(
        { action: 'mail_box_list', domain: domainOf((payload ?? {}) as Payload) }, undefined, LIST_TIMEOUT_MS,
      ),
    },
    'boxes.add': {
      summary: 'Créer une boîte (payload: { domain, local, password?, quotaMb?, displayName? }) — mot de passe généré si absent',
      handler: async (payload) => {
        const p = (payload ?? {}) as Payload;
        const generated = p.password === undefined || p.password === '';
        const password = generated ? generatePassword() : validatePasswordPolicy(String(p.password));
        const domain = domainOf(p);
        const quotaMb = p.quotaMb === undefined
          ? (await callHelper<{ domains: MailDomainInfo[] }>({ action: 'mail_domain_list' })).domains.find((d) => d.domain === domain)?.defaultQuotaMb ?? DEFAULT_QUOTA_MB
          : quotaOf(p.quotaMb, 'Quota');
        const box = await callHelper<MailBoxInfo>({
          action: 'mail_box_add', domain, local: localOf(p), password, quotaMb, displayName: displayNameOf(p.displayName),
        });
        // Le mot de passe généré n'est rendu qu'ici, une seule fois : il n'est stocké nulle part en clair
        return generated ? { ...box, generatedPassword: password } : box;
      },
    },
    'boxes.update': {
      summary: 'Modifier une boîte (payload: { domain, local, quotaMb?, suspended?, displayName? })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        return callHelper<MailBoxInfo>({
          action: 'mail_box_set',
          domain: domainOf(p),
          local: localOf(p),
          ...(p.quotaMb !== undefined ? { quotaMb: quotaOf(p.quotaMb, 'Quota') } : {}),
          ...(p.suspended !== undefined ? { suspended: booleanOf(p.suspended, 'suspended') } : {}),
          ...(p.displayName !== undefined ? { displayName: displayNameOf(p.displayName) } : {}),
        });
      },
    },
    'boxes.password': {
      summary: 'Changer le mot de passe d\'une boîte (payload: { domain, local, password? }) — généré si absent',
      handler: async (payload) => {
        const p = (payload ?? {}) as Payload;
        const generated = p.password === undefined || p.password === '';
        const password = generated ? generatePassword() : validatePasswordPolicy(String(p.password));
        await callHelper<{ updated: boolean }>({ action: 'mail_box_password', domain: domainOf(p), local: localOf(p), password });
        return generated ? { updated: true, generatedPassword: password } : { updated: true };
      },
    },
    'boxes.delete': {
      summary: 'Supprimer une boîte (payload: { domain, local, deleteData })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        return callHelper<{ deleted: boolean }>({ action: 'mail_box_remove', domain: domainOf(p), local: localOf(p), deleteData: booleanOf(p.deleteData, 'deleteData') });
      },
    },
  },
};

if (!parentPort) throw new Error('mail worker must run in a worker thread');
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
