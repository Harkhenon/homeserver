// DNS et délivrabilité du service e-mail : enregistrements attendus, vérification en direct,
// publication dans les zones Bind, rDNS, port 25 sortant, listes noires.
import { Resolver } from 'node:dns/promises';
import { connect, isIP } from 'node:net';
import { BIND_UNIT, listZoneFiles, loadZone, nextSerial, writeZoneChecked, type DnsRecord, type RecordType } from '../bind9/zonefile.js';
import { callHelper } from '../../core/privileged/client.js';
import type { MailDomainInfo, MailStatusResult } from '../../core/privileged/contract.js';

export type RecordKey = 'host' | 'mx' | 'spf' | 'dkim' | 'dkim-pending' | 'dmarc' | 'tlsrpt' | 'autoconfig' | 'srv-submission' | 'srv-imaps' | 'srv-pop3s';

export interface ExpectedRecord {
  key: RecordKey;
  label: string;
  purpose: string;
  required: boolean;
  /** Nom relatif à la zone du domaine (null : le nom d'hôte est hors de ce domaine). */
  name: string | null;
  fqdn: string;
  type: RecordType;
  value: string;
}

export interface CheckedRecord extends ExpectedRecord {
  status: 'ok' | 'missing' | 'different' | 'error';
  current: string | null;
}

const TTL = 3600;

function resolver(): Resolver {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  // Résolveur imposé : DNS interne, ou zone pas encore déléguée
  const server = process.env.HS_MAIL_DNS_SERVER;
  if (server) r.setServers([server]);
  return r;
}

export function effectiveIp(status: MailStatusResult): string | null {
  return status.publicIp ?? status.serverIp;
}

export function expectedRecords(domain: string, status: MailStatusResult, info: MailDomainInfo): ExpectedRecord[] {
  const host = status.hostname as string;
  const ip = effectiveIp(status);
  const dot = `${host}.`;
  const relName = (fqdn: string): string | null => {
    if (fqdn === domain) return '@';
    return fqdn.endsWith(`.${domain}`) ? fqdn.slice(0, -domain.length - 1) : null;
  };
  const spf = `v=spf1 mx${status.relay?.spfInclude ? ` include:${status.relay.spfInclude}` : ''} -all`;
  const list: ExpectedRecord[] = [];
  if (ip) {
    list.push({
      key: 'host', label: 'Serveur (A)', purpose: `Adresse de ${host}`, required: true,
      name: relName(host), fqdn: host, type: 'A', value: ip,
    });
  }
  list.push(
    { key: 'mx', label: 'Réception (MX)', purpose: 'Indique quel serveur reçoit le courrier du domaine', required: true, name: '@', fqdn: domain, type: 'MX', value: `10 ${dot}` },
    { key: 'spf', label: 'SPF', purpose: 'Liste les serveurs autorisés à envoyer pour le domaine', required: true, name: '@', fqdn: domain, type: 'TXT', value: spf },
  );
  if (info.dkim) {
    const fqdn = `${info.dkim.selector}._domainkey.${domain}`;
    list.push({ key: 'dkim', label: 'DKIM', purpose: 'Clé publique qui vérifie la signature des messages envoyés', required: true, name: relName(fqdn), fqdn, type: 'TXT', value: info.dkim.record });
  }
  if (info.dkimPending) {
    const fqdn = `${info.dkimPending.selector}._domainkey.${domain}`;
    list.push({ key: 'dkim-pending', label: 'DKIM (nouvelle clé)', purpose: 'Rotation en cours : à publier avant d\'activer la nouvelle clé', required: true, name: relName(fqdn), fqdn, type: 'TXT', value: info.dkimPending.record });
  }
  list.push(
    { key: 'dmarc', label: 'DMARC', purpose: 'Politique appliquée aux messages qui échouent SPF et DKIM', required: true, name: '_dmarc', fqdn: `_dmarc.${domain}`, type: 'TXT', value: `v=DMARC1; p=none; rua=mailto:postmaster@${domain}` },
    { key: 'tlsrpt', label: 'TLS-RPT', purpose: 'Rapports sur les échecs de chiffrement en réception', required: false, name: '_smtp._tls', fqdn: `_smtp._tls.${domain}`, type: 'TXT', value: `v=TLSRPTv1; rua=mailto:postmaster@${domain}` },
    { key: 'autoconfig', label: 'Autoconfig', purpose: 'Configuration automatique de Thunderbird et compatibles', required: false, name: 'autoconfig', fqdn: `autoconfig.${domain}`, type: 'CNAME', value: dot },
    { key: 'srv-submission', label: 'SRV envoi', purpose: 'Découverte du serveur d\'envoi par les logiciels de messagerie', required: false, name: '_submission._tcp', fqdn: `_submission._tcp.${domain}`, type: 'SRV', value: `0 1 587 ${dot}` },
    { key: 'srv-imaps', label: 'SRV IMAP', purpose: 'Découverte du serveur IMAP', required: false, name: '_imaps._tcp', fqdn: `_imaps._tcp.${domain}`, type: 'SRV', value: `0 1 993 ${dot}` },
    { key: 'srv-pop3s', label: 'SRV POP3', purpose: 'Découverte du serveur POP3', required: false, name: '_pop3s._tcp', fqdn: `_pop3s._tcp.${domain}`, type: 'SRV', value: `0 1 995 ${dot}` },
  );
  return list;
}

function norm(v: string): string {
  return v.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
}

function isSpf(v: string): boolean {
  return /^"?v=spf1\b/i.test(v.trim());
}

/** Enregistrement public satisfaisant, même écrit autrement que notre valeur suggérée ? */
function txtMatches(rec: ExpectedRecord, values: string[]): { ok: boolean; current: string | null } {
  if (rec.key === 'spf') {
    const spf = values.find(isSpf) ?? null;
    return { ok: spf !== null && norm(spf) === norm(rec.value), current: spf };
  }
  if (rec.key === 'dmarc') {
    const v = values.find((t) => /^v=DMARC1\b/i.test(t)) ?? null;
    return { ok: v !== null, current: v };
  }
  if (rec.key === 'tlsrpt') {
    const v = values.find((t) => /^v=TLSRPTv1\b/i.test(t)) ?? null;
    return { ok: v !== null, current: v };
  }
  const v = values.find((t) => norm(t) === norm(rec.value)) ?? values[0] ?? null;
  return { ok: v !== null && norm(v) === norm(rec.value), current: v };
}

async function checkOne(rec: ExpectedRecord, r: Resolver): Promise<CheckedRecord> {
  const result = (status: CheckedRecord['status'], current: string | null): CheckedRecord => ({ ...rec, status, current });
  try {
    switch (rec.type) {
      case 'A': {
        const ips = await r.resolve4(rec.fqdn);
        return result(ips.includes(rec.value) ? 'ok' : 'different', ips.join(', '));
      }
      case 'MX': {
        const mx = await r.resolveMx(rec.fqdn);
        const target = norm(rec.value.split(' ')[1] ?? '');
        const current = mx.map((m) => `${m.priority} ${m.exchange}`).join(', ');
        return result(mx.some((m) => norm(m.exchange) === target) ? 'ok' : 'different', current);
      }
      case 'TXT': {
        const values = (await r.resolveTxt(rec.fqdn)).map((chunks) => chunks.join(''));
        if (values.length === 0) return result('missing', null);
        const m = txtMatches(rec, values);
        if (m.current === null) return result('missing', null);
        return result(m.ok ? 'ok' : 'different', m.current);
      }
      case 'CNAME': {
        const names = await r.resolveCname(rec.fqdn);
        return result(names.some((n) => norm(n) === norm(rec.value)) ? 'ok' : 'different', names.join(', '));
      }
      case 'SRV': {
        const srv = await r.resolveSrv(rec.fqdn);
        const [, , port, target] = rec.value.split(' ');
        const current = srv.map((s) => `${s.priority} ${s.weight} ${s.port} ${s.name}`).join(', ');
        return result(srv.some((s) => String(s.port) === port && norm(s.name) === norm(target ?? '')) ? 'ok' : 'different', current);
      }
      default:
        return result('error', null);
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === 'ENODATA' || code === 'ENOTFOUND' ? result('missing', null) : result('error', code ?? 'erreur DNS');
  }
}

export function checkRecords(records: ExpectedRecord[]): Promise<CheckedRecord[]> {
  const r = resolver();
  return Promise.all(records.map((rec) => checkOne(rec, r)));
}

/** Le domaine a-t-il une zone gérée par ce serveur ? Sinon, publication manuelle chez le registrar. */
export async function hasLocalZone(domain: string): Promise<boolean> {
  try {
    return (await listZoneFiles()).includes(`${domain}.zone`);
  } catch {
    return false; // Bind non installé
  }
}

export interface ApplyResult {
  added: string[];
  replaced: string[];
  unchanged: string[];
  conflicts: Array<{ label: string; current: string; expected: string }>;
}

function zoneName(name: string, domain: string): string {
  const n = name.replace(/\.$/, '');
  if (n === domain) return '@';
  return n.endsWith(`.${domain}`) ? n.slice(0, -domain.length - 1) : n;
}

/**
 * Ajoute à la zone Bind ce qui manque. Un enregistrement existant et différent n'est jamais remplacé
 * sans demande explicite : il est signalé en conflit (un SPF ou un MX peut être voulu).
 */
export async function applyRecords(domain: string, records: ExpectedRecord[], replace: boolean): Promise<ApplyResult> {
  const zone = await loadZone(domain);
  const result: ApplyResult = { added: [], replaced: [], unchanged: [], conflicts: [] };
  let next: DnsRecord[] = [...zone.records];
  for (const rec of records) {
    if (rec.name === null) continue; // nom d'hôte hors de cette zone
    const sameName = next.filter((z) => zoneName(z.name, domain) === rec.name);
    const clashing = sameName.filter((z) => {
      if (rec.type === 'CNAME' || z.type === 'CNAME') return true; // un CNAME exclut tout autre type
      if (z.type !== rec.type) return false;
      return rec.key === 'spf' ? isSpf(z.value) : true;
    });
    if (clashing.some((z) => z.type === rec.type && norm(z.value) === norm(rec.value))) {
      result.unchanged.push(rec.label);
      continue;
    }
    if (clashing.length > 0) {
      if (!replace) {
        result.conflicts.push({ label: rec.label, current: clashing.map((z) => `${z.type} ${z.value}`).join(', '), expected: `${rec.type} ${rec.value}` });
        continue;
      }
      next = next.filter((z) => !clashing.includes(z));
      result.replaced.push(rec.label);
    } else {
      result.added.push(rec.label);
    }
    next.push({ name: rec.name, type: rec.type, value: rec.value, ttl: TTL });
  }
  if (result.added.length > 0 || result.replaced.length > 0) {
    await writeZoneChecked(domain, next, nextSerial(zone));
    await callHelper({ action: 'systemctl', unit: BIND_UNIT, verb: 'reload' });
  }
  return result;
}

// --- Délivrabilité -------------------------------------------------------------------------------

/** Une IP privée n'est pas routable : ni rDNS public ni listes noires n'ont de sens. */
function isPrivateIp(ip: string): boolean {
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) || isIP(ip) === 6;
}

function smtpBanner(host: string, port: number, timeoutMs = 8000): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean, detail: string): void => {
      socket.destroy();
      resolve({ ok, detail });
    };
    socket.setTimeout(timeoutMs, () => done(false, `Pas de réponse de ${host}:${port} après ${timeoutMs / 1000} s (port probablement bloqué)`));
    socket.on('error', (e: NodeJS.ErrnoException) => done(false, `${host}:${port} injoignable (${e.code ?? e.message})`));
    socket.once('data', (d: Buffer) => {
      const banner = d.toString('utf8').split('\r\n')[0] ?? '';
      socket.write('QUIT\r\n');
      done(banner.startsWith('220'), banner.slice(0, 120));
    });
  });
}

const BLACKLISTS = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org'];

async function blacklistStatus(ip: string, zone: string, r: Resolver): Promise<boolean | null> {
  const reversed = ip.split('.').reverse().join('.');
  try {
    const answers = await r.resolve4(`${reversed}.${zone}`);
    // 127.255.255.x : la liste refuse de répondre à ce résolveur (résolveurs publics), résultat inconnu
    return answers.some((a) => a.startsWith('127.255.255.')) ? null : answers.length > 0;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === 'ENODATA' || code === 'ENOTFOUND' ? false : null;
  }
}

export interface DeliverabilityReport {
  ip: string | null;
  ipPrivate: boolean;
  hostname: string;
  hostnameResolves: boolean;
  rdns: { ptr: string[]; matches: boolean } | null;
  port25: { ok: boolean; detail: string };
  relay: { ok: boolean; detail: string } | null;
  blacklists: Array<{ list: string; listed: boolean | null }>;
}

export async function deliverabilityReport(status: MailStatusResult): Promise<DeliverabilityReport> {
  const r = resolver();
  const ip = effectiveIp(status);
  const hostname = status.hostname as string;
  const ipPrivate = ip === null || isPrivateIp(ip);
  const ips = await r.resolve4(hostname).catch(() => [] as string[]);
  let rdns: DeliverabilityReport['rdns'] = null;
  if (ip && !ipPrivate) {
    const ptr = await r.reverse(ip).catch(() => [] as string[]);
    rdns = { ptr, matches: ptr.some((p) => norm(p) === norm(hostname)) };
  }
  const [port25, relay, blacklists] = await Promise.all([
    smtpBanner('gmail-smtp-in.l.google.com', 25),
    status.relay ? smtpBanner(status.relay.host, status.relay.port) : Promise.resolve(null),
    ip && !ipPrivate
      ? Promise.all(BLACKLISTS.map(async (list) => ({ list, listed: await blacklistStatus(ip, list, r) })))
      : Promise.resolve([]),
  ]);
  return { ip, ipPrivate, hostname, hostnameResolves: ip !== null && ips.includes(ip), rdns, port25, relay, blacklists };
}
