import { parentPort } from 'node:worker_threads';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import { validatePasswordPolicy } from '../../core/password-policy.js';
import type { MailAntispamConfig, MailBackupInfo, MailLogsResult, MailQueueResult, MailAliasInfo, MailStatusResult, MailDomainInfo, MailBoxInfo, MailTestResult } from '../../core/privileged/contract.js';
import { applyRecords, checkRecords, deliverabilityReport, expectedRecords, hasLocalZone, type ExpectedRecord } from './dns.js';

// Le helper revalide tout (contrat) : ici, des messages d'erreur lisibles pour le panel.
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOCAL_RE = /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}$/;
const DESTINATION_RE = /^[a-z0-9._%+-]{1,64}@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
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

function countOf(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1_000_000) throw new Error(`${label} invalide`);
  return v;
}

/** Adresses saisies (liste ou texte séparé par virgules, espaces ou retours à la ligne). */
function destinationsOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : [];
  const out = list.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  for (const d of out) if (!DESTINATION_RE.test(d)) throw new Error(`Adresse invalide : ${d}`);
  if (out.length > 50) throw new Error('50 destinations maximum');
  return out;
}

function dateOf(v: unknown, label: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${label} invalide (AAAA-MM-JJ)`);
  return v;
}

function booleanOf(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${label} requis`);
  return v;
}

async function expectedFor(domain: string): Promise<ExpectedRecord[]> {
  const [status, list] = await Promise.all([
    callHelper<MailStatusResult>({ action: 'mail_status' }),
    callHelper<{ domains: MailDomainInfo[] }>({ action: 'mail_domain_list' }),
  ]);
  const info = list.domains.find((d) => d.domain === domain);
  if (!info) throw new Error(`Domaine ${domain} inconnu`);
  return expectedRecords(domain, status, info);
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
    'settings.set': {
      summary: 'IP publique du serveur quand il est derrière un NAT (payload: { publicIp: string | null })',
      handler: (payload) => {
        const v = ((payload ?? {}) as Payload).publicIp;
        const publicIp = typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
        if (publicIp !== null && isIP(publicIp) === 0) throw new Error('Adresse IP invalide');
        return callHelper<MailStatusResult>({ action: 'mail_settings_set', publicIp });
      },
    },
    'relay.set': {
      summary: 'Envoyer via un relais SMTP (payload: { host, port, username, password, spfInclude? })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const host = typeof p.host === 'string' ? p.host.trim().toLowerCase() : '';
        if (!DOMAIN_RE.test(host) && isIP(host) === 0) throw new Error('Serveur relais invalide');
        if (p.port !== 25 && p.port !== 465 && p.port !== 587 && p.port !== 2525) throw new Error('Port du relais invalide (25, 465, 587 ou 2525)');
        const username = typeof p.username === 'string' ? p.username.trim() : '';
        if (!/^[^\s:]{1,255}$/.test(username)) throw new Error('Identifiant du relais invalide');
        const password = typeof p.password === 'string' ? p.password : '';
        if (password === '' || password.length > 512) throw new Error('Mot de passe du relais requis');
        const spf = typeof p.spfInclude === 'string' ? p.spfInclude.trim().toLowerCase() : '';
        if (spf !== '' && !DOMAIN_RE.test(spf)) throw new Error('Domaine SPF du relais invalide (ex : spf.brevo.com)');
        return callHelper<MailStatusResult>({ action: 'mail_relay_set', host, port: p.port, username, password, spfInclude: spf === '' ? null : spf });
      },
    },
    'relay.clear': {
      summary: 'Envoyer directement, sans relais',
      handler: () => callHelper<MailStatusResult>({ action: 'mail_relay_clear' }),
    },
    'deliverability.check': {
      summary: 'Diagnostic d\'envoi : IP, rDNS, port 25 sortant, listes noires',
      handler: async () => deliverabilityReport(await callHelper<MailStatusResult>({ action: 'mail_status' })),
    },
    'test.send': {
      summary: 'Envoyer un e-mail de test depuis postmaster@domaine et suivre sa livraison (payload: { domain, to })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const to = typeof p.to === 'string' ? p.to.trim() : '';
        if (!EMAIL_RE.test(to)) throw new Error('Adresse du destinataire invalide');
        return callHelper<MailTestResult>({ action: 'mail_test_send', domain: domainOf(p), to });
      },
    },
    'dns.records': {
      summary: 'Enregistrements DNS attendus pour un domaine et leur état public (payload: { domain })',
      handler: async (payload) => {
        const domain = domainOf((payload ?? {}) as Payload);
        const expected = await expectedFor(domain);
        return { zone: await hasLocalZone(domain), records: await checkRecords(expected) };
      },
    },
    'dns.apply': {
      summary: 'Publier les enregistrements dans la zone Bind du domaine (payload: { domain, replace? })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Payload;
        const domain = domainOf(p);
        if (!(await hasLocalZone(domain))) throw new Error(`Aucune zone Bind pour ${domain} : publie les enregistrements chez le registrar`);
        return applyRecords(domain, await expectedFor(domain), p.replace === true);
      },
    },
    'dkim.rotate': {
      summary: 'Préparer une nouvelle clé DKIM, à publier avant de l\'activer (payload: { domain })',
      handler: (payload) => callHelper<MailDomainInfo>({ action: 'mail_dkim_rotate', domain: domainOf((payload ?? {}) as Payload) }),
    },
    'dkim.activate': {
      summary: 'Signer avec la nouvelle clé DKIM, une fois publiée (payload: { domain, force? })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Payload;
        const domain = domainOf(p);
        if (p.force !== true) {
          const records = await checkRecords((await expectedFor(domain)).filter((r) => r.key === 'dkim-pending'));
          if (records.some((r) => r.status !== 'ok')) throw new Error('La nouvelle clé n\'est pas encore visible dans le DNS : activer maintenant ferait échouer DKIM sur les messages envoyés');
        }
        return callHelper<MailDomainInfo>({ action: 'mail_dkim_activate', domain });
      },
    },
    'antispam.set': {
      summary: 'Antispam (payload: { engine, rbl, strictSender, junkScore, rejectScore, clamav })',
      handler: (payload) => {
        const p = (payload ?? {}) as Partial<MailAntispamConfig>;
        const engine = p.engine === 'rspamd' ? 'rspamd' : 'basic';
        const junkScore = Number(p.junkScore);
        const rejectScore = Number(p.rejectScore);
        if (!Number.isFinite(junkScore) || !Number.isFinite(rejectScore) || junkScore < 1 || rejectScore > 100 || junkScore >= rejectScore) {
          throw new Error('Scores invalides : le seuil de refus doit dépasser celui des indésirables (1 à 100)');
        }
        return callHelper<MailStatusResult>({ action: 'mail_antispam_set', config: { engine, rbl: p.rbl === true, strictSender: p.strictSender === true, junkScore, rejectScore, clamav: p.clamav === true } }, undefined, SETUP_TIMEOUT_MS);
      },
    },
    'webmail.set': {
      summary: 'Activer ou désactiver le webmail Roundcube (payload: { enabled })',
      handler: (payload) => {
        const panelPort = Number(process.env.HS_PORT ?? 3000);
        return callHelper<MailStatusResult>({ action: 'mail_webmail_set', enabled: ((payload ?? {}) as Payload).enabled === true, panelPort }, undefined, SETUP_TIMEOUT_MS);
      },
    },
    'queue.list': {
      summary: 'Messages en file d\'attente',
      handler: () => callHelper<MailQueueResult>({ action: 'mail_queue_list' }),
    },
    'queue.action': {
      summary: 'Agir sur la file d\'attente (payload: { action: flush|retry|delete|hold|release, id? }) — sans id : toute la file',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const queueAction = p.action;
        if (queueAction !== 'flush' && queueAction !== 'retry' && queueAction !== 'delete' && queueAction !== 'hold' && queueAction !== 'release') throw new Error('Action invalide');
        const id = typeof p.id === 'string' && p.id !== '' ? p.id : undefined;
        return callHelper<MailQueueResult>({ action: 'mail_queue_action', queueAction, ...(id ? { id } : {}) });
      },
    },
    logs: {
      summary: 'Journaux du courrier, 7 jours au plus (payload: { query?, limit? }) — query : adresse ou texte',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const query = typeof p.query === 'string' ? p.query.trim() : '';
        const limit = typeof p.limit === 'number' ? Math.min(2000, Math.max(1, Math.floor(p.limit))) : 300;
        return callHelper<MailLogsResult>({ action: 'mail_logs', limit, ...(query ? { query } : {}) });
      },
    },
    'backups.list': {
      summary: 'Sauvegardes de messagerie',
      handler: () => callHelper<{ backups: MailBackupInfo[] }>({ action: 'mail_backup_list' }),
    },
    'backups.create': {
      summary: 'Sauvegarder un domaine ou une boîte (payload: { domain, local? })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const local = p.local === undefined || p.local === null || p.local === '' ? null : localOf(p);
        return callHelper<MailBackupInfo>({ action: 'mail_backup_create', domain: domainOf(p), local }, undefined, SETUP_TIMEOUT_MS);
      },
    },
    'backups.delete': {
      summary: 'Supprimer une sauvegarde (payload: { file })',
      handler: (payload) => callHelper<{ deleted: boolean }>({ action: 'mail_backup_delete', file: String(((payload ?? {}) as Payload).file ?? '') }),
    },
    'backups.restore': {
      summary: 'Restaurer une sauvegarde : fusionne les messages, recrée ce qui manque, n\'écrase rien (payload: { file })',
      handler: (payload) => callHelper<{ restored: boolean; recreatedBoxes: string[] }>({ action: 'mail_backup_restore', file: String(((payload ?? {}) as Payload).file ?? '') }, undefined, SETUP_TIMEOUT_MS),
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
          ...(p.maxBoxes !== undefined ? { maxBoxes: countOf(p.maxBoxes, 'Nombre de boîtes') } : {}),
          ...(p.sendLimitPerHour !== undefined ? { sendLimitPerHour: countOf(p.sendLimitPerHour, 'Limite d\'envoi') } : {}),
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
          ...(p.sendLimitPerHour !== undefined ? { sendLimitPerHour: p.sendLimitPerHour === null ? null : countOf(p.sendLimitPerHour, 'Limite d\'envoi') } : {}),
        });
      },
    },
    'boxes.forward': {
      summary: 'Rediriger une boîte (payload: { domain, local, destinations, keepCopy }) — liste vide pour arrêter',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        return callHelper<MailBoxInfo>({ action: 'mail_forward_set', domain: domainOf(p), local: localOf(p), destinations: destinationsOf(p.destinations), keepCopy: p.keepCopy !== false });
      },
    },
    'boxes.vacation': {
      summary: 'Répondeur d\'absence (payload: { domain, local, enabled, subject, message, startDate?, endDate? })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const enabled = booleanOf(p.enabled, 'enabled');
        const subject = typeof p.subject === 'string' ? p.subject.trim() : '';
        const message = typeof p.message === 'string' ? p.message.trim() : '';
        if (subject.length > 200 || /[\r\n]/.test(subject)) throw new Error('Objet invalide (une ligne, 200 caractères max.)');
        if (message.length > 5000) throw new Error('Message trop long (5000 caractères max.)');
        if (enabled && (!subject || !message)) throw new Error('Objet et message requis pour activer le répondeur');
        return callHelper<MailBoxInfo>({ action: 'mail_vacation_set', domain: domainOf(p), local: localOf(p), enabled, subject, message, startDate: dateOf(p.startDate, 'Date de début'), endDate: dateOf(p.endDate, 'Date de fin') }, undefined, LIST_TIMEOUT_MS);
      },
    },
    'aliases.list': {
      summary: 'Alias et catch-all d\'un domaine (payload: { domain })',
      handler: (payload) => callHelper<{ aliases: MailAliasInfo[]; catchAll: string | null }>({ action: 'mail_alias_list', domain: domainOf((payload ?? {}) as Payload) }),
    },
    'aliases.set': {
      summary: 'Créer ou modifier un alias (payload: { domain, local, destinations })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const destinations = destinationsOf(p.destinations);
        if (destinations.length === 0) throw new Error('Au moins une destination requise');
        return callHelper({ action: 'mail_alias_set', domain: domainOf(p), local: localOf(p), destinations }, undefined, LIST_TIMEOUT_MS);
      },
    },
    'aliases.delete': {
      summary: 'Supprimer un alias (payload: { domain, local })',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        return callHelper({ action: 'mail_alias_remove', domain: domainOf(p), local: localOf(p) });
      },
    },
    'catchall.set': {
      summary: 'Adresse qui reçoit tout le courrier sans destinataire connu (payload: { domain, destination }) — vide pour retirer',
      handler: (payload) => {
        const p = (payload ?? {}) as Payload;
        const destinations = destinationsOf(p.destination ?? '');
        if (destinations.length > 1) throw new Error('Une seule adresse pour le catch-all');
        return callHelper({ action: 'mail_catchall_set', domain: domainOf(p), destination: destinations[0] ?? null }, undefined, LIST_TIMEOUT_MS);
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
