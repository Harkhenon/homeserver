// Service e-mail (rôle : root). Postfix + Dovecot + OpenDKIM, boîtes virtuelles sous /var/vmail.
//
// state.json est la source de vérité. Maps Postfix, passwd-file Dovecot et tables OpenDKIM en
// sont entièrement régénérés (applyState), jamais édités : pas de dérive possible, et retour à
// la version précédente si la configuration résultante est refusée.
//
// Multi-distro : maps `texthash:` (hash/lmdb varient selon les paquets), services Postfix
// déclarés par numéro de port (/etc/services varie), un gabarit par génération de Dovecot.
import { X509Certificate, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  chmodSync, chownSync, copyFileSync, existsSync, lchownSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { errText, exec, execInput, serviceActive, tryExec } from './mail-util.js';
import {
  DEFAULT_ANTISPAM, SPAM_SIEVE, antispamAllowed, antispamUnits, applyAntispam, memoryMb, postfixAntispamSettings, rspamdAvailable, writeSpamSieve,
} from './mail-antispam.js';
import {
  detectWebServer, disableWebmail, enableWebmail, newWebmailState, refreshWebmailOnStart, secretMatches, verifyMailPassword, webmailAvailable, webmailRunning, type WebmailState,
} from './mail-webmail.js';
import { backupCreate, backupDelete, backupExtract, backupList, backupRead, mailLogs, queueAction, queueList } from './mail-ops.js';
import type { MailAntispamConfig, MailAliasInfo, MailBoxInfo, MailDomainInfo, MailRequest, MailStatusResult, MailTestResult, MailVacation } from '../server/src/core/privileged/contract.js';


const STATE_DIR = '/var/lib/homeserver-mail';
const STATE_FILE = `${STATE_DIR}/state.json`;
const VMAIL_DIR = '/var/vmail';
const VMAIL_USER = 'vmail';
const POSTFIX_MAPS = '/etc/postfix/homeserver';
const DOVECOT_CONF = '/etc/dovecot/dovecot.conf';
const DOVECOT_CONF_ORIG = '/etc/dovecot/dovecot.conf.homeserver-orig';
const DOVECOT_USERS = '/etc/dovecot/homeserver-users';
const OPENDKIM_CONF = '/etc/opendkim.conf';
const OPENDKIM_CONF_ORIG = '/etc/opendkim.conf.homeserver-orig';
const OPENDKIM_DIR = '/etc/opendkim';
const OPENDKIM_DROPIN = '/etc/systemd/system/opendkim.service.d/zz-homeserver.conf';
const TLS_DIR = '/etc/homeserver-mail/tls';
const TLS_CERT = `${TLS_DIR}/fullchain.pem`;
const TLS_KEY = `${TLS_DIR}/privkey.pem`;
const RELAY_PASSWD = `${POSTFIX_MAPS}/relay_passwd`;
const AUTOCONFIG_ROOT = '/var/www/homeserver-mail';
const AUTOCONFIG_SITE = 'homeserver-mail-autoconfig.conf';
const CERTBOT_HOOK = '/etc/letsencrypt/renewal-hooks/deploy/homeserver-mail.sh';
const DKIM_SELECTOR = 'hs1';
const CONF_MARKER = '# Généré par Homeserver';
const POLICY_UNIT = 'hs-mail-policy';
const POLICY_UNIT_FILE = `/etc/systemd/system/${POLICY_UNIT}.service`;
const BASE_SERVICES = ['postfix', 'dovecot', 'opendkim', POLICY_UNIT];
/** À incrémenter quand la configuration générée change : les serveurs déjà activés sont mis à niveau. */
const CONFIG_VERSION = 4;
const DEFAULT_SEND_LIMIT = 500;
const MAIL_PORTS = ['25', '465', '587', '993', '995'];

export interface MailDeps {
  family: 'debian' | 'rhel';
  pkgInstall(packages: string[]): Promise<void>;
  pkgRefresh(): Promise<void>;
  /** Active les jails fail2ban du mail (sans effet si fail2ban n'est pas installé). */
  enableMailJails(): Promise<void>;
  log(line: string): void;
}

interface BoxState {
  hash: string;
  quotaMb: number;
  displayName: string;
  suspended: boolean;
  forward?: { destinations: string[]; keepCopy: boolean } | null;
  vacation?: MailVacation | null;
  sendLimitPerHour?: number | null;
  createdAt: string;
}

interface AliasState {
  destinations: string[];
  createdAt: string;
}

interface DomainState {
  suspended: boolean;
  defaultQuotaMb: number;
  dkimSelector: string;
  dkimPending?: string;
  maxBoxes: number;
  sendLimitPerHour: number;
  catchAll: string | null;
  aliases: Record<string, AliasState>;
  createdAt: string;
  boxes: Record<string, BoxState>;
}

interface MailState {
  schema: 1;
  configVersion?: number;
  hostname: string | null;
  tlsMode: 'selfsigned' | 'letsencrypt' | null;
  publicIp?: string | null;
  // Mot de passe du relais en clair ici et dans la map Postfix : root seul (0600), inévitable pour s'y authentifier
  relay?: { host: string; port: number; username: string; password: string; spfInclude: string | null } | null;
  antispam?: MailAntispamConfig;
  webmail?: WebmailState;
  domains: Record<string, DomainState>;
}

type BackupMeta =
  | { kind: 'domain'; domain: string; state: DomainState; dkim: Record<string, string> }
  | { kind: 'box'; domain: string; local: string; box: BoxState };

function emptyState(): MailState {
  return { schema: 1, hostname: null, tlsMode: null, domains: {} };
}

function loadState(): MailState {
  try {
    const state = { ...emptyState(), ...(JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<MailState>) };
    // Domaines créés avant ces réglages
    for (const d of Object.values(state.domains)) {
      d.aliases ??= {};
      d.catchAll ??= null;
      d.maxBoxes ??= 0;
      d.sendLimitPerHour ??= DEFAULT_SEND_LIMIT;
    }
    return state;
  } catch (e) {
    // Fichier absent = pas encore configuré. Illisible = surtout ne rien écraser.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
    throw new Error(`État du service e-mail illisible (${STATE_FILE}) : ${(e as Error).message}`);
  }
}

function saveState(state: MailState): void {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  chmodSync(STATE_DIR, 0o700);
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(tmp, STATE_FILE);
}

/** Toute modification d'état est sérialisée : deux requêtes simultanées ne se marchent pas dessus. */
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

// --- Dovecot : deux générations, configuration incompatible ---------------------------------

async function dovecotVersion(): Promise<string | null> {
  const out = await tryExec('dovecot', ['--version'], 10_000);
  return out?.match(/^\d+\.\d+(\.\d+)*/)?.[0] ?? null;
}

function isDovecot24(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return (major ?? 0) > 2 || ((major ?? 0) === 2 && (minor ?? 0) >= 4);
}

const DOVECOT_COMMON = `listen = *, ::
auth_mechanisms = plain login

service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}
namespace inbox {
  inbox = yes
  separator = /
  mailbox Drafts {
    special_use = \\Drafts
    auto = subscribe
  }
  mailbox Sent {
    special_use = \\Sent
    auto = subscribe
  }
  mailbox Junk {
    special_use = \\Junk
    auto = subscribe
  }
  mailbox Trash {
    special_use = \\Trash
    auto = subscribe
  }
}
`;

function renderDovecotConf(version: string, vmailUid: number): string {
  if (isDovecot24(version)) {
    return `dovecot_config_version = ${version}
dovecot_storage_version = ${version}
${CONF_MARKER} — ne pas éditer (régénéré par le panel).
protocols = imap pop3 lmtp
first_valid_uid = ${vmailUid}
mail_driver = maildir
mail_path = ~/Maildir
auth_allow_cleartext = no
ssl = required
ssl_server_cert_file = ${TLS_CERT}
ssl_server_key_file = ${TLS_KEY}
ssl_min_protocol = TLSv1.2
lmtp_rcpt_check_quota = yes
mail_plugins {
  quota = yes
}
protocol imap {
  mail_plugins {
    imap_quota = yes
  }
}
protocol lmtp {
  mail_plugins {
    sieve = yes
  }
}
sieve_script personal {
  driver = file
  path = ~/sieve
  active_path = ~/.dovecot.sieve
}
sieve_script homeserver_spam {
  type = before
  driver = file
  path = ${SPAM_SIEVE}
}
quota "User quota" {
}
passdb passwd-file {
  driver = passwd-file
  passwd_file_path = ${DOVECOT_USERS}
}
userdb passwd-file {
  driver = passwd-file
  passwd_file_path = ${DOVECOT_USERS}
}
${DOVECOT_COMMON}`;
  }
  return `${CONF_MARKER} — ne pas éditer (régénéré par le panel).
protocols = imap pop3 lmtp
first_valid_uid = ${vmailUid}
mail_location = maildir:~/Maildir
disable_plaintext_auth = yes
ssl = required
ssl_cert = <${TLS_CERT}
ssl_key = <${TLS_KEY}
ssl_min_protocol = TLSv1.2
lmtp_rcpt_check_quota = yes
mail_plugins = $mail_plugins quota
protocol imap {
  mail_plugins = $mail_plugins imap_quota
}
protocol lmtp {
  mail_plugins = $mail_plugins sieve
}
plugin {
  quota = count:User quota
  quota_vsizes = yes
  sieve = file:~/sieve;active=~/.dovecot.sieve
  sieve_before = ${SPAM_SIEVE}
}
passdb {
  driver = passwd-file
  args = ${DOVECOT_USERS}
}
userdb {
  driver = passwd-file
  args = ${DOVECOT_USERS}
}
${DOVECOT_COMMON}`;
}

/** Limite de quota dans le passwd-file : le nom du champ dépend de la génération de Dovecot. */
function quotaField(version: string, quotaMb: number): string {
  if (quotaMb === 0) return '';
  return isDovecot24(version) ? `userdb_quota_storage_size=${quotaMb}M` : `userdb_quota_rule=*:storage=${quotaMb}M`;
}

async function hashPassword(password: string): Promise<string> {
  const supported = (await tryExec('doveadm', ['pw', '-l'], 10_000)) ?? '';
  // ARGON2ID : le plus robuste quand Dovecot est compilé avec ; BLF-CRYPT sinon.
  const scheme = /\bARGON2ID\b/.test(supported) ? 'ARGON2ID' : /\bBLF-CRYPT\b/.test(supported) ? 'BLF-CRYPT' : 'SHA512-CRYPT';
  const out = await execInput('doveadm', ['pw', '-s', scheme], `${password}\n${password}\n`);
  const hash = out.trim();
  if (!hash.startsWith(`{${scheme}}`) || /[:\s]/.test(hash)) throw new Error('Hash du mot de passe inattendu');
  return hash;
}

// --- Génération des fichiers depuis l'état ---------------------------------------------------

interface VmailIds {
  uid: number;
  gid: number;
}

async function vmailIds(): Promise<VmailIds> {
  const uid = Number((await exec('id', ['-u', VMAIL_USER])).trim());
  const gid = Number((await exec('id', ['-g', VMAIL_USER])).trim());
  if (!Number.isInteger(uid) || !Number.isInteger(gid)) throw new Error(`Utilisateur ${VMAIL_USER} introuvable`);
  return { uid, gid };
}

async function ownerIds(user: string): Promise<VmailIds> {
  return {
    uid: Number((await exec('id', ['-u', user])).trim()),
    gid: Number((await exec('id', ['-g', user])).trim()),
  };
}

interface OutFile {
  path: string;
  content: string;
  mode: number;
  uid: number;
  gid: number;
}

function relayDest(relay: { host: string; port: number }): string {
  return `[${relay.host}]:${relay.port}`;
}

function dkimKeyPath(domain: string, selector: string): string {
  return `${OPENDKIM_DIR}/keys/${domain}/${selector}.private`;
}

async function renderFiles(state: MailState, version: string): Promise<OutFile[]> {
  const vmail = await vmailIds();
  const dovecot = await ownerIds('dovecot');
  const opendkim = await ownerIds('opendkim');
  const root = { uid: 0, gid: 0 };
  const domains: string[] = [];
  const mailboxes: string[] = [];
  const senders: string[] = [];
  const users: string[] = [];
  const keyTable: string[] = [];
  const signingTable: string[] = [];
  const aliases: string[] = [];
  const blocked: string[] = [];
  const limits: Record<string, number> = {};
  for (const [domain, d] of Object.entries(state.domains)) {
    // Domaine suspendu : connu de Postfix (réponse 550 propre) mais sans aucune boîte active
    domains.push(`${domain} OK`);
    if (!d.suspended) {
      keyTable.push(`${d.dkimSelector}._domainkey.${domain} ${domain}:${d.dkimSelector}:${dkimKeyPath(domain, d.dkimSelector)}`);
      signingTable.push(`*@${domain} ${d.dkimSelector}._domainkey.${domain}`);
    }
    if (!d.suspended && d.catchAll) aliases.push(`@${domain} ${d.catchAll}`);
    for (const [local, b] of Object.entries(d.boxes)) {
      const address = `${local}@${domain}`;
      if (d.suspended || b.suspended) {
        // Refus dès le RCPT : ni catch-all, ni acceptation suivie d'un renvoi à l'expéditeur
        if (!d.suspended) blocked.push(`${address} 550 5.2.1 Mailbox disabled`);
        continue;
      }
      mailboxes.push(`${address} OK`);
      senders.push(`${address} ${address}`);
      users.push(`${address}:${b.hash}:${vmail.uid}:${vmail.gid}::${VMAIL_DIR}/${domain}/${local}::${quotaField(version, b.quotaMb)}`);
      const limit = b.sendLimitPerHour ?? d.sendLimitPerHour;
      if (limit > 0) limits[address] = limit;
      if (b.forward && b.forward.destinations.length > 0) {
        const targets = b.forward.keepCopy ? [...b.forward.destinations, address] : b.forward.destinations;
        aliases.push(`${address} ${targets.join(',')}`);
      } else if (d.catchAll) {
        // Un catch-all l'emporte sur les boîtes sans cette ligne d'identité
        aliases.push(`${address} ${address}`);
      }
    }
    if (d.suspended) continue;
    for (const [local, alias] of Object.entries(d.aliases)) {
      const address = `${local}@${domain}`;
      aliases.push(`${address} ${alias.destinations.join(',')}`);
      // Les boîtes destinataires peuvent envoyer sous l'adresse de l'alias
      const owners = alias.destinations.filter((dest) => {
        const [l, dom] = dest.split('@') as [string, string];
        const box = state.domains[dom]?.boxes[l];
        return box !== undefined && !box.suspended;
      });
      if (owners.length > 0) senders.push(`${address} ${owners.join(',')}`);
    }
  }
  const text = (lines: string[]): string => (lines.length ? `${lines.join('\n')}\n` : '');
  return [
    { path: `${POSTFIX_MAPS}/domains`, content: text(domains), mode: 0o644, ...root },
    { path: `${POSTFIX_MAPS}/mailboxes`, content: text(mailboxes), mode: 0o644, ...root },
    { path: `${POSTFIX_MAPS}/aliases`, content: text(aliases), mode: 0o644, ...root },
    { path: `${POSTFIX_MAPS}/blocked_recipients`, content: text(blocked), mode: 0o644, ...root },
    { path: `${POSTFIX_MAPS}/send_limits.json`, content: JSON.stringify(limits), mode: 0o644, ...root },
    { path: `${POSTFIX_MAPS}/senders`, content: text(senders), mode: 0o644, ...root },
    {
      path: RELAY_PASSWD,
      content: state.relay ? `${relayDest(state.relay)} ${state.relay.username}:${state.relay.password}\n` : '',
      mode: 0o600,
      ...root,
    },
    { path: DOVECOT_USERS, content: text(users), mode: 0o640, uid: 0, gid: dovecot.gid },
    { path: `${OPENDKIM_DIR}/KeyTable`, content: text(keyTable), mode: 0o640, ...opendkim },
    { path: `${OPENDKIM_DIR}/SigningTable`, content: text(signingTable), mode: 0o640, ...opendkim },
  ];
}

function writeAtomic(f: OutFile): void {
  const tmp = `${f.path}.tmp`;
  writeFileSync(tmp, f.content, { mode: f.mode });
  chownSync(tmp, f.uid, f.gid);
  chmodSync(tmp, f.mode);
  renameSync(tmp, f.path);
}

/** Écrit la configuration, la valide, recharge les services. Tout est restauré si elle est refusée. */
async function applyState(state: MailState, deps: MailDeps): Promise<void> {
  const version = await dovecotVersion();
  if (!version) throw new Error('Dovecot n\'est pas installé');
  const files = await renderFiles(state, version);
  const backups = files.map((f) => ({ f, previous: existsSync(f.path) ? readFileSync(f.path, 'utf8') : null }));
  for (const f of files) writeAtomic(f);
  try {
    await exec('postfix', ['check'], 30_000);
    await exec('doveconf', ['-n'], 30_000);
  } catch (e) {
    for (const { f, previous } of backups) {
      if (previous === null) rmSync(f.path, { force: true });
      else writeAtomic({ ...f, content: previous });
    }
    deps.log(`mail : configuration refusée, retour à la précédente : ${errText(e)}`);
    throw new Error(`Configuration du mail refusée : ${errText(e)}`);
  }
  saveState(state);
  // Maps texthash : lues au démarrage des processus Postfix, d'où le reload
  if (await serviceActive('postfix')) await exec('postfix', ['reload'], 30_000);
  if (await serviceActive('opendkim')) await exec('systemctl', ['restart', 'opendkim'], 30_000);
  // Confort pour les logiciels de messagerie : un échec ne doit jamais bloquer le service mail
  await writeAutoconfig(state).catch((e: Error) => deps.log(`mail : autoconfig non publiée : ${e.message}`));
}

// --- Configuration automatique des logiciels de messagerie (Thunderbird et compatibles) ---------

function renderAutoconfigXml(state: MailState): string {
  const host = state.hostname as string;
  const domains = Object.keys(state.domains).map((d) => `    <domain>${d}</domain>`).join('\n');
  const incoming = (type: string, port: number): string => `    <incomingServer type="${type}">
      <hostname>${host}</hostname>
      <port>${port}</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </incomingServer>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="${host}">
${domains}
    <displayName>${host}</displayName>
${incoming('imap', 993)}
${incoming('pop3', 995)}
    <outgoingServer type="smtp">
      <hostname>${host}</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>
`;
}

async function writeAutoconfig(state: MailState): Promise<void> {
  const aliases = Object.keys(state.domains).map((d) => `autoconfig.${d}`);
  const apacheDebian = existsSync('/etc/apache2/sites-available');
  const apache = (await serviceActive('apache2')) || (await serviceActive('httpd'));
  const nginx = !apache && (await serviceActive('nginx'));
  if (!apache && !nginx) return;
  const nginxDebian = existsSync('/etc/nginx/sites-available');
  const available = apache
    ? (apacheDebian ? `/etc/apache2/sites-available/${AUTOCONFIG_SITE}` : `/etc/httpd/conf.d/${AUTOCONFIG_SITE}`)
    : (nginxDebian ? `/etc/nginx/sites-available/${AUTOCONFIG_SITE}` : `/etc/nginx/conf.d/${AUTOCONFIG_SITE}`);
  const enabled = apache
    ? (apacheDebian ? `/etc/apache2/sites-enabled/${AUTOCONFIG_SITE}` : null)
    : (nginxDebian ? `/etc/nginx/sites-enabled/${AUTOCONFIG_SITE}` : null);
  const test: [string, string[]] = apache ? [apacheDebian ? 'apache2ctl' : 'httpd', ['-t']] : ['nginx', ['-t']];
  const unit = apache ? (apacheDebian ? 'apache2' : 'httpd') : 'nginx';
  const previous = existsSync(available) ? readFileSync(available, 'utf8') : null;

  if (aliases.length === 0) {
    if (previous === null) return;
    if (enabled) rmSync(enabled, { force: true });
    rmSync(available, { force: true });
    await exec('systemctl', ['reload', unit], 30_000);
    return;
  }
  mkdirSync(`${AUTOCONFIG_ROOT}/mail`, { recursive: true, mode: 0o755 });
  writeFileSync(`${AUTOCONFIG_ROOT}/mail/config-v1.1.xml`, renderAutoconfigXml(state), { mode: 0o644 });
  const conf = apache ? `${CONF_MARKER}
<VirtualHost *:80>
  ServerName ${aliases[0]}
  ServerAlias ${aliases.join(' ')}
  DocumentRoot ${AUTOCONFIG_ROOT}
  <Directory ${AUTOCONFIG_ROOT}>
    Options None
    AllowOverride None
    Require all granted
  </Directory>
</VirtualHost>
` : `${CONF_MARKER}
server {
  listen 80;
  listen [::]:80;
  server_name ${aliases.join(' ')};
  root ${AUTOCONFIG_ROOT};
}
`;
  if (conf === previous) return;
  writeFileSync(available, conf, { mode: 0o644 });
  if (enabled && !existsSync(enabled)) symlinkSync(available, enabled);
  try {
    await exec(test[0], test[1], 30_000);
  } catch (e) {
    if (previous === null) {
      if (enabled) rmSync(enabled, { force: true });
      rmSync(available, { force: true });
    } else {
      writeFileSync(available, previous, { mode: 0o644 });
    }
    throw new Error(`configuration web refusée : ${errText(e)}`);
  }
  await exec('systemctl', ['reload', unit], 30_000);
}

// --- E-mail de test ------------------------------------------------------------------------------

/** Envoie un message signé et suit sa livraison dans le journal de Postfix (~25 s au plus). */
async function sendTestMail(domain: string, to: string): Promise<MailTestResult> {
  const messageId = `hs-test-${randomBytes(9).toString('hex')}@${domain}`;
  const from = `postmaster@${domain}`;
  const body = [
    `From: ${from}`,
    `To: ${to}`,
    'Subject: Test de messagerie Homeserver',
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    `Ce message de test a ete envoye depuis le panel Homeserver pour le domaine ${domain}.`,
    '',
  ].join('\n');
  await execInput('sendmail', ['-i', '-f', from, '--', to], body, 30_000);
  let queueId = '';
  let last: { status: MailTestResult['status']; detail: string } = { status: 'pending', detail: 'Message en file d\'attente' };
  for (let i = 0; i < 25; i++) {
    const log = (await tryExec('journalctl', ['-S', '-5min', '-o', 'cat', '--no-pager', '-n', '5000'], 15_000)) ?? '';
    const lines = log.split('\n');
    queueId ||= lines.find((l) => l.includes(`message-id=<${messageId}>`))?.match(/([0-9A-Za-z]+): message-id=/)?.[1] ?? '';
    const line = queueId ? lines.find((l) => l.includes(`${queueId}: to=<`)) : undefined;
    const m = line?.match(/status=(sent|deferred|bounced) \((.*)\)$/);
    if (m) {
      last = { status: m[1] as MailTestResult['status'], detail: m[2] ?? '' };
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { messageId, ...last };
}

async function configureRelay(relay: MailState['relay']): Promise<void> {
  const settings: Record<string, string> = relay ? {
    relayhost: relayDest(relay),
    smtp_sasl_auth_enable: 'yes',
    smtp_sasl_password_maps: `texthash:${RELAY_PASSWD}`,
    smtp_sasl_security_options: 'noanonymous',
    smtp_sasl_tls_security_options: 'noanonymous',
    // Jamais d'identifiants en clair vers le relais ; 465 = TLS implicite
    smtp_tls_security_level: 'encrypt',
    smtp_tls_wrappermode: relay.port === 465 ? 'yes' : 'no',
  } : {
    relayhost: '',
    smtp_sasl_auth_enable: 'no',
    smtp_sasl_password_maps: '',
    smtp_tls_security_level: 'may',
    smtp_tls_wrappermode: 'no',
  };
  await exec('postconf', ['-e', ...Object.entries(settings).map(([k, v]) => `${k}=${v}`)], 30_000);
}

// --- Installation --------------------------------------------------------------------------

async function installPackages(deps: MailDeps): Promise<void> {
  await deps.pkgRefresh();
  if (deps.family === 'debian') {
    // Sinon le paquet postfix attend une réponse debconf (ou reste sans main.cf)
    await execInput('debconf-set-selections', [], 'postfix postfix/main_mailer_type select Internet Site\n');
    await deps.pkgInstall(['postfix', 'dovecot-imapd', 'dovecot-pop3d', 'dovecot-lmtpd', 'dovecot-sieve', 'opendkim', 'openssl']);
    return;
  }
  // OpenDKIM vient d'EPEL sur RHEL/Rocky/Alma (déjà dans les dépôts sur Fedora)
  if (!/^ID="?fedora/m.test(readFileSync('/etc/os-release', 'utf8'))) {
    await deps.pkgInstall(['epel-release']).catch((e: Error) => deps.log(`mail : epel-release ignoré : ${e.message}`));
  }
  await deps.pkgInstall(['postfix', 'dovecot', 'dovecot-pigeonhole', 'opendkim', 'openssl']);
}

/** Refuse d'écraser un serveur de mail configuré à la main. */
async function assertNoForeignMailServer(state: MailState): Promise<void> {
  if (state.hostname) return;
  const vdomains = ((await tryExec('postconf', ['-h', 'virtual_mailbox_domains'], 10_000)) ?? '').trim();
  if (vdomains && !vdomains.includes(POSTFIX_MAPS) && vdomains !== '$virtual_mailbox_maps') {
    throw new Error(`Postfix est déjà configuré pour des domaines virtuels (${vdomains}) : installation annulée pour ne pas écraser ce serveur`);
  }
  // Le helper n'a pas la capacité de voir le processus (ss -p) : on raisonne sur l'adresse. Un MTA
  // local (exim4 tiré par Debian, sendmail) n'écoute qu'en boucle locale et sera remplacé ; un
  // service qui écoute publiquement est un vrai serveur de mail, à ne pas écraser.
  const listeners = ((await tryExec('ss', ['-H', '-ltn', 'sport = :25'], 10_000)) ?? '').trim().split('\n').filter(Boolean);
  const isPublic = listeners.some((l) => !/\s(127\.0\.0\.1|\[::1\]):25\s/.test(l));
  if (isPublic && !(await serviceActive('postfix'))) {
    throw new Error(`Le port 25 est déjà utilisé par un autre service : ${listeners.join(' ; ').slice(0, 200)}`);
  }
}

/** MTA local par défaut encore présent après l'installation de Postfix : il occuperait le port 25. */
async function stopLocalMta(deps: MailDeps): Promise<void> {
  for (const unit of ['exim4', 'sendmail']) {
    if (await serviceActive(unit)) {
      await exec('systemctl', ['disable', '--now', unit], 60_000);
      deps.log(`mail : ${unit} arrêté, remplacé par Postfix`);
    }
  }
}

async function ensureVmailUser(): Promise<void> {
  if ((await tryExec('id', ['-u', VMAIL_USER], 10_000)) === null) {
    const shell = existsSync('/usr/sbin/nologin') ? '/usr/sbin/nologin' : '/sbin/nologin';
    await exec('useradd', ['-r', '-U', '-M', '-d', VMAIL_DIR, '-s', shell, VMAIL_USER]);
  }
  const { uid, gid } = await vmailIds();
  mkdirSync(VMAIL_DIR, { recursive: true, mode: 0o750 });
  chownSync(VMAIL_DIR, uid, gid);
  chmodSync(VMAIL_DIR, 0o750);
}

/** SELinux : les boîtes doivent porter un type que Dovecot peut écrire. */
async function ensureSelinux(deps: MailDeps): Promise<void> {
  if ((await tryExec('selinuxenabled', [], 5_000)) === null) return;
  const rule = `${VMAIL_DIR}(/.*)?`;
  if ((await tryExec('semanage', ['fcontext', '-a', '-t', 'mail_home_rw_t', rule], 60_000)) === null) {
    // Règle déjà présente, ou semanage absent : modification, sinon simple avertissement
    if ((await tryExec('semanage', ['fcontext', '-m', '-t', 'mail_home_rw_t', rule], 60_000)) === null) {
      deps.log('mail : règle SELinux de /var/vmail non posée (semanage indisponible ?)');
    }
  }
  await tryExec('restorecon', ['-R', VMAIL_DIR], 60_000);
}

/** Certificat auto-signé : le service démarre tout de suite, Let's Encrypt le remplace ensuite. */
async function ensureTls(state: MailState, hostname: string): Promise<void> {
  mkdirSync(TLS_DIR, { recursive: true, mode: 0o750 });
  chmodSync(TLS_DIR, 0o750);
  if (existsSync(TLS_CERT) && existsSync(TLS_KEY) && state.tlsMode) {
    // Nom d'hôte changé : l'ancien certificat (et son renouvellement Let's Encrypt) ne vaut plus
    const san = new X509Certificate(readFileSync(TLS_CERT)).subjectAltName ?? '';
    if (san.split(/,\s*/).includes(`DNS:${hostname}`)) return;
    rmSync(CERTBOT_HOOK, { force: true });
  }
  await exec('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650',
    '-subj', `/CN=${hostname}`, '-addext', `subjectAltName=DNS:${hostname}`,
    '-keyout', TLS_KEY, '-out', TLS_CERT,
  ], 60_000);
  chmodSync(TLS_KEY, 0o600);
  chmodSync(TLS_CERT, 0o644);
  state.tlsMode = 'selfsigned';
}

async function configurePostfix(hostname: string, antispam: MailAntispamConfig): Promise<void> {
  const settings: Record<string, string> = {
    myhostname: hostname,
    myorigin: '$myhostname',
    // Domaines gérés en virtuel uniquement : ne jamais les lister dans mydestination
    mydestination: 'localhost',
    mynetworks: '127.0.0.0/8 [::1]/128',
    inet_interfaces: 'all',
    inet_protocols: 'all',
    recipient_delimiter: '+',
    message_size_limit: '52428800',
    mailbox_size_limit: '0',
    disable_vrfy_command: 'yes',
    smtpd_helo_required: 'yes',
    smtpd_banner: '$myhostname ESMTP',
    virtual_mailbox_domains: `texthash:${POSTFIX_MAPS}/domains`,
    virtual_mailbox_maps: `texthash:${POSTFIX_MAPS}/mailboxes`,
    virtual_alias_maps: `texthash:${POSTFIX_MAPS}/aliases`,
    virtual_transport: 'lmtp:unix:private/dovecot-lmtp',
    smtpd_sender_login_maps: `texthash:${POSTFIX_MAPS}/senders`,
    // Port 25 : réception seulement, jamais de relais sans authentification
    smtpd_relay_restrictions: 'permit_mynetworks reject_unauth_destination',
    smtpd_tls_cert_file: TLS_CERT,
    smtpd_tls_key_file: TLS_KEY,
    smtpd_tls_security_level: 'may',
    smtpd_tls_protocols: '>=TLSv1.2',
    smtpd_tls_mandatory_protocols: '>=TLSv1.2',
    smtp_tls_security_level: 'may',
    smtp_tls_loglevel: '1',
    smtp_address_preference: 'ipv4',
    smtpd_sasl_type: 'dovecot',
    smtpd_sasl_path: 'private/auth',
    // Service de limites en panne : le courrier passe, on ne bloque pas tous les envois pour ça
    smtpd_policy_service_default_action: 'DUNNO',
    // Paramètre nommé : postconf -P refuse les espaces dans une valeur
    hs_send_limit_policy: 'check_policy_service inet:127.0.0.1:10031',
    milter_default_action: 'accept',
    milter_protocol: '6',
  };
  await exec('postconf', ['-e', ...Object.entries({ ...settings, ...postfixAntispamSettings(antispam, `${POSTFIX_MAPS}/blocked_recipients`) }).map(([k, v]) => `${k}=${v}`)], 30_000);
  // 587 (STARTTLS) et 465 (TLS implicite) : envoi authentifié, adresse imposée par le compte
  for (const [port, wrapper] of [['587', 'no'], ['465', 'yes']] as const) {
    await exec('postconf', ['-M', `${port}/inet=${port} inet n - n - - smtpd`], 30_000);
    const params: Record<string, string> = {
      syslog_name: `postfix/submission-${port}`,
      smtpd_tls_security_level: 'encrypt',
      smtpd_tls_wrappermode: wrapper,
      smtpd_sasl_auth_enable: 'yes',
      smtpd_tls_auth_only: 'yes',
      smtpd_client_restrictions: 'permit_sasl_authenticated,reject',
      smtpd_sender_restrictions: 'reject_sender_login_mismatch',
      smtpd_relay_restrictions: 'permit_sasl_authenticated,reject',
      // Limite d'envoi par compte, vérifiée une fois le nombre de destinataires connu
      smtpd_end_of_data_restrictions: '$hs_send_limit_policy',
      // Client authentifié : pas de listes noires (IP résidentielle), pas d'exigence sur son HELO
      smtpd_recipient_restrictions: 'permit_sasl_authenticated,reject',
      smtpd_helo_restrictions: '',
    };
    for (const [k, v] of Object.entries(params)) {
      await exec('postconf', ['-P', `${port}/inet/${k}=${v}`], 30_000);
    }
  }
}

async function configureDovecot(version: string, deps: MailDeps): Promise<void> {
  if (existsSync(DOVECOT_CONF) && !readFileSync(DOVECOT_CONF, 'utf8').includes(CONF_MARKER) && !existsSync(DOVECOT_CONF_ORIG)) {
    copyFileSync(DOVECOT_CONF, DOVECOT_CONF_ORIG);
  }
  const { uid } = await vmailIds();
  await writeSpamSieve();
  writeFileSync(DOVECOT_CONF, renderDovecotConf(version, uid), { mode: 0o644 });
  // passwd-file vide mais présent : doveconf et le démarrage ne doivent pas échouer
  if (!existsSync(DOVECOT_USERS)) writeFileSync(DOVECOT_USERS, '', { mode: 0o640 });
  deps.log(`mail : configuration Dovecot ${version} écrite`);
}

/** Sans capacité ni accès en écriture : root seulement pour lire la release, qui lui appartient. */
async function installPolicyUnit(): Promise<void> {
  const install = process.env.HS_INSTALL_DIR ?? '/usr/share/homeserver';
  writeFileSync(POLICY_UNIT_FILE, `${CONF_MARKER}
[Unit]
Description=Homeserver - limites d'envoi par compte (politique Postfix)
After=network.target
Before=postfix.service

[Service]
Type=simple
ExecStart=${process.execPath} ${install}/current/server/dist/helper/mail-policy.js
Restart=always
RestartSec=2
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
SystemCallArchitectures=native
MemoryMax=128M

[Install]
WantedBy=multi-user.target
`, { mode: 0o644 });
  await exec('systemctl', ['daemon-reload'], 30_000);
}

/** Serveur activé par une version précédente : ajoute ce qui manque, sans toucher à ses données. */
async function upgradeConfig(state: MailState, deps: MailDeps): Promise<void> {
  if (!state.hostname || state.configVersion === CONFIG_VERSION) return;
  deps.log(`mail : mise à niveau de la configuration (${state.configVersion ?? 1} → ${CONFIG_VERSION})`);
  const wasRunning = await serviceActive('postfix');
  await installPackages(deps);
  const version = await dovecotVersion();
  if (!version) throw new Error('Dovecot introuvable');
  await configureDovecot(version, deps);
  await configurePostfix(state.hostname, state.antispam ?? DEFAULT_ANTISPAM);
  await configureRelay(state.relay ?? null);
  await installPolicyUnit();
  await applyState(state, deps);
  if (wasRunning) await startServices();
  await deps.enableMailJails().catch((e: Error) => deps.log(`mail : jails fail2ban non activées : ${e.message}`));
  state.configVersion = CONFIG_VERSION;
  saveState(state);
  deps.log('mail : configuration à jour');
}

export function upgradeMailOnStart(deps: MailDeps): void {
  void locked(async () => {
    const state = loadState();
    await upgradeConfig(state, deps);
    if (state.webmail?.enabled) await refreshWebmailOnStart(deps);
  })
    .catch((e: Error) => deps.log(`mail : mise à niveau impossible : ${errText(e)}`));
}

// --- Alias et redirections ------------------------------------------------------------------------

/** Adresse locale existante ? Une destination vers un domaine géré ici doit être réelle. */
function assertLocalDestinations(state: MailState, destinations: string[]): void {
  for (const dest of destinations) {
    const [local, domain] = dest.split('@') as [string, string];
    const d = state.domains[domain];
    if (d && !d.boxes[local] && !d.aliases[local]) throw new Error(`${dest} n'existe pas sur ce serveur`);
  }
}

/** Refuse toute boucle (a → b → a) : Postfix la détecterait, mais en renvoyant le courrier à l'expéditeur. */
function assertNoLoop(state: MailState, start: string): void {
  const next = (address: string): string[] => {
    const [local, domain] = address.split('@') as [string, string];
    const d = state.domains[domain];
    if (!d) return [];
    if (d.aliases[local]) return d.aliases[local].destinations;
    return d.boxes[local]?.forward?.destinations ?? [];
  };
  const walk = (address: string, seen: Set<string>): void => {
    for (const dest of next(address)) {
      if (dest === start) throw new Error(`Boucle détectée : ${address} renvoie vers ${start}`);
      if (!seen.has(dest)) {
        seen.add(dest);
        walk(dest, seen);
      }
    }
  };
  walk(start, new Set());
}

/** Adresse supprimée : plus aucun alias, redirection ni catch-all ne doit pointer vers elle. */
function pruneDestination(state: MailState, address: string): void {
  for (const d of Object.values(state.domains)) {
    if (d.catchAll === address) d.catchAll = null;
    for (const [local, alias] of Object.entries(d.aliases)) {
      alias.destinations = alias.destinations.filter((x) => x !== address);
      if (alias.destinations.length === 0) delete d.aliases[local];
    }
    for (const b of Object.values(d.boxes)) {
      if (b.forward) {
        b.forward.destinations = b.forward.destinations.filter((x) => x !== address);
        if (b.forward.destinations.length === 0) b.forward = null;
      }
    }
  }
}

// --- Répondeur d'absence (Sieve) ------------------------------------------------------------------

function sieveString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r\n/g, '\n')}"`;
}

function renderVacationSieve(v: MailVacation, addresses: string[]): string {
  const conditions: string[] = [];
  if (v.startDate) conditions.push(`currentdate :value "ge" "date" ${sieveString(v.startDate)}`);
  if (v.endDate) conditions.push(`currentdate :value "le" "date" ${sieveString(v.endDate)}`);
  const test = conditions.length > 0 ? `allof(${conditions.join(', ')})` : 'true';
  return `# ${CONF_MARKER.slice(2)}
require ["vacation", "date", "relational"];
if ${test} {
  vacation :days 1 :subject ${sieveString(v.subject)} :addresses [${addresses.map(sieveString).join(', ')}] ${sieveString(v.message)};
}
`;
}

/** Écrit (ou retire) le script de la boîte, sous l'utilisateur vmail : ces répertoires sont les siens. */
async function writeVacation(domain: string, local: string, v: MailVacation | null, addresses: string[]): Promise<void> {
  const { uid, gid } = await vmailIds();
  const home = `${VMAIL_DIR}/${domain}/${local}`;
  const active = `${home}/.dovecot.sieve`;
  const script = `${home}/sieve/homeserver.sieve`;
  rmSync(active, { force: true });
  if (!v || !v.enabled) return;
  // Parents créés sous vmail : Dovecot doit pouvoir y écrire le binaire compilé du script
  await exec('runuser', ['-u', VMAIL_USER, '--', 'mkdir', '-p', '-m', '0700', `${home}/sieve`], 15_000);
  if (lstatSync(`${home}/sieve`).isSymbolicLink()) throw new Error('Répertoire sieve inattendu');
  rmSync(script, { force: true });
  writeFileSync(script, renderVacationSieve(v, addresses), { mode: 0o600, flag: 'wx' });
  chownSync(script, uid, gid);
  try {
    await exec('runuser', ['-u', VMAIL_USER, '--', 'sievec', script], 30_000);
  } catch (e) {
    rmSync(script, { force: true });
    throw new Error(`Répondeur refusé par Sieve : ${errText(e)}`);
  }
  symlinkSync('sieve/homeserver.sieve', active);
  lchownSync(active, uid, gid);
}

async function configureOpendkim(): Promise<void> {
  const owner = await ownerIds('opendkim');
  mkdirSync(`${OPENDKIM_DIR}/keys`, { recursive: true, mode: 0o750 });
  chownSync(OPENDKIM_DIR, owner.uid, owner.gid);
  chmodSync(OPENDKIM_DIR, 0o750);
  chownSync(`${OPENDKIM_DIR}/keys`, owner.uid, owner.gid);
  chmodSync(`${OPENDKIM_DIR}/keys`, 0o750);
  if (existsSync(OPENDKIM_CONF) && !readFileSync(OPENDKIM_CONF, 'utf8').includes(CONF_MARKER) && !existsSync(OPENDKIM_CONF_ORIG)) {
    copyFileSync(OPENDKIM_CONF, OPENDKIM_CONF_ORIG);
  }
  writeFileSync(OPENDKIM_CONF, `${CONF_MARKER} — ne pas éditer (régénéré par le panel).
Syslog yes
UMask 007
UserID opendkim
Mode s
Socket inet:8891@127.0.0.1
Canonicalization relaxed/simple
SignatureAlgorithm rsa-sha256
OversignHeaders From
KeyTable ${OPENDKIM_DIR}/KeyTable
SigningTable refile:${OPENDKIM_DIR}/SigningTable
InternalHosts ${OPENDKIM_DIR}/TrustedHosts
PidFile /run/opendkim/opendkim.pid
`, { mode: 0o644 });
  writeAtomic({ path: `${OPENDKIM_DIR}/TrustedHosts`, content: '127.0.0.1\n::1\n', mode: 0o640, ...owner });
  // Debian génère un socket local depuis /etc/default/opendkim, prioritaire sur la conf : cette
  // surcharge (dernière par ordre alphabétique) donne le même démarrage sur toutes les distros.
  mkdirSync('/etc/systemd/system/opendkim.service.d', { recursive: true });
  writeFileSync(OPENDKIM_DROPIN, `${CONF_MARKER}
[Service]
Type=forking
PIDFile=/run/opendkim/opendkim.pid
RuntimeDirectory=opendkim
RuntimeDirectoryMode=0750
ExecStart=
ExecStart=/usr/sbin/opendkim -x ${OPENDKIM_CONF}
`, { mode: 0o644 });
  await exec('systemctl', ['daemon-reload'], 30_000);
}

/** Ouvre les ports uniquement si un pare-feu est actif (sinon rien à faire, et rien à activer). */
async function setFirewall(open: boolean, deps: MailDeps): Promise<void> {
  const verb = open ? 'ouverts' : 'fermés';
  const ufw = await tryExec('ufw', ['status'], 15_000);
  if (ufw?.startsWith('Status: active')) {
    for (const p of MAIL_PORTS) await exec('ufw', open ? ['allow', `${p}/tcp`] : ['delete', 'allow', `${p}/tcp`], 30_000);
    deps.log(`mail : ports ${verb} dans ufw (${MAIL_PORTS.join(', ')})`);
    return;
  }
  if ((await tryExec('firewall-cmd', ['--state'], 15_000)) !== null) {
    for (const p of MAIL_PORTS) await exec('firewall-cmd', ['--quiet', '--permanent', open ? `--add-port=${p}/tcp` : `--remove-port=${p}/tcp`], 30_000);
    await exec('firewall-cmd', ['--quiet', '--reload'], 60_000);
    deps.log(`mail : ports ${verb} dans firewalld (${MAIL_PORTS.join(', ')})`);
  }
}

function allUnits(state: MailState, family: 'debian' | 'rhel'): string[] {
  return [...BASE_SERVICES, ...antispamUnits(state.antispam ?? DEFAULT_ANTISPAM, family)];
}

/** Le socle doit démarrer ; l'antispam est lancé à part (clamd attend le téléchargement de sa base). */
async function startServices(): Promise<void> {
  for (const unit of BASE_SERVICES) {
    await exec('systemctl', ['reset-failed', unit], 15_000).catch(() => undefined);
    await exec('systemctl', ['enable', unit], 30_000);
    await exec('systemctl', ['restart', unit], 60_000);
  }
  const down: string[] = [];
  for (const unit of BASE_SERVICES) if (!(await serviceActive(unit))) down.push(unit);
  if (down.length > 0) {
    const journal = await tryExec('journalctl', ['-n', '12', '--no-pager', ...down.flatMap((u) => ['-u', u])], 15_000);
    throw new Error(`Service(s) non démarré(s) : ${down.join(', ')}\n${(journal ?? '').trim()}`);
  }
}

// --- État --------------------------------------------------------------------------------------

async function status(family: 'debian' | 'rhel'): Promise<MailStatusResult> {
  const state = loadState();
  const synced = await tryExec('timedatectl', ['show', '-p', 'NTPSynchronized', '--value'], 10_000);
  const installed = (await tryExec('postconf', ['-h', 'mail_version'], 10_000)) !== null
    && (await dovecotVersion()) !== null
    && (await tryExec('id', ['-u', 'opendkim'], 10_000)) !== null;
  const services: Record<string, boolean> = {};
  for (const unit of allUnits(state, family)) services[unit] = await serviceActive(unit);
  let expiresAt: string | null = null;
  try {
    expiresAt = new Date(new X509Certificate(readFileSync(TLS_CERT)).validTo).toISOString();
  } catch { /* pas encore de certificat */ }
  const route = (await tryExec('ip', ['-4', 'route', 'get', '1.1.1.1'], 5_000)) ?? '';
  const domains = Object.values(state.domains);
  return {
    installed,
    configured: installed && state.hostname !== null,
    hostname: state.hostname,
    serverIp: route.match(/\bsrc (\S+)/)?.[1] ?? null,
    services,
    dovecotVersion: await dovecotVersion(),
    tls: { mode: state.tlsMode, expiresAt },
    publicIp: state.publicIp ?? null,
    relay: state.relay ? { host: state.relay.host, port: state.relay.port, username: state.relay.username, spfInclude: state.relay.spfInclude } : null,
    antispam: state.antispam ?? DEFAULT_ANTISPAM,
    webmail: {
      available: await webmailAvailable(family),
      webServer: (await detectWebServer(family)) !== null,
      enabled: state.webmail?.enabled === true,
      active: state.webmail?.enabled === true && (await webmailRunning(family)),
      url: state.webmail?.enabled === true && state.hostname ? `https://${state.hostname}/` : null,
    },
    rspamdAvailable: await rspamdAvailable(family),
    memoryMb: memoryMb(),
    clockSynced: synced === null ? null : synced.trim() === 'yes',
    domainCount: domains.length,
    boxCount: domains.reduce((n, d) => n + Object.keys(d.boxes).length, 0),
  };
}

function assertConfigured(state: MailState): void {
  if (!state.hostname) throw new Error('Le service e-mail n\'est pas activé');
}

function getDomain(state: MailState, domain: string): DomainState {
  const d = state.domains[domain];
  if (!d) throw new Error(`Domaine ${domain} inconnu`);
  return d;
}

function getBox(d: DomainState, domain: string, local: string): BoxState {
  const b = d.boxes[local];
  if (!b) throw new Error(`Boîte ${local}@${domain} inconnue`);
  return b;
}

function dkimRecord(domain: string, selector: string): MailDomainInfo['dkim'] {
  try {
    const der = createPublicKey(readFileSync(dkimKeyPath(domain, selector))).export({ type: 'spki', format: 'der' });
    return { selector, record: `v=DKIM1; k=rsa; p=${der.toString('base64')}` };
  } catch {
    return null;
  }
}

function domainInfo(domain: string, d: DomainState): MailDomainInfo {
  return {
    domain,
    suspended: d.suspended,
    defaultQuotaMb: d.defaultQuotaMb,
    boxCount: Object.keys(d.boxes).length,
    dkim: dkimRecord(domain, d.dkimSelector),
    dkimPending: d.dkimPending ? dkimRecord(domain, d.dkimPending) : null,
    maxBoxes: d.maxBoxes,
    sendLimitPerHour: d.sendLimitPerHour,
    aliasCount: Object.keys(d.aliases).length,
    catchAll: d.catchAll,
    createdAt: d.createdAt,
  };
}

async function boxUsageMb(domain: string, local: string): Promise<number> {
  const out = await tryExec('du', ['-sk', `${VMAIL_DIR}/${domain}/${local}`], 120_000);
  const kb = Number(out?.split(/\s/)[0]);
  return Number.isFinite(kb) ? Math.ceil(kb / 1024) : 0;
}

async function boxMessages(address: string): Promise<number | null> {
  const out = await tryExec('doveadm', ['quota', 'get', '-u', address], 15_000);
  const m = out?.match(/\bMESSAGE\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

async function domainUsedMb(domain: string): Promise<number> {
  const out = await tryExec('du', ['-sk', `${VMAIL_DIR}/${domain}`], 120_000);
  const kb = Number(out?.split(/\s/)[0]);
  return Number.isFinite(kb) ? Math.ceil(kb / 1024) : 0;
}

async function boxInfo(domain: string, local: string, b: BoxState, d: DomainState): Promise<MailBoxInfo> {
  return {
    address: `${local}@${domain}`,
    local,
    displayName: b.displayName,
    quotaMb: b.quotaMb,
    usedMb: await boxUsageMb(domain, local),
    messages: await boxMessages(`${local}@${domain}`),
    suspended: b.suspended,
    forward: b.forward ?? null,
    vacation: b.vacation ?? null,
    sendLimitPerHour: b.sendLimitPerHour ?? null,
    effectiveSendLimit: b.sendLimitPerHour ?? d.sendLimitPerHour,
    createdAt: b.createdAt,
  };
}

/** Coupe les sessions IMAP en cours : un mot de passe changé ou une boîte suspendue doit agir tout de suite. */
async function kick(address: string): Promise<void> {
  await tryExec('doveadm', ['kick', address], 15_000);
}

async function ensureDkimDir(domain: string): Promise<void> {
  const owner = await ownerIds('opendkim');
  const dir = `${OPENDKIM_DIR}/keys/${domain}`;
  mkdirSync(dir, { recursive: true, mode: 0o750 });
  chownSync(dir, owner.uid, owner.gid);
  chmodSync(dir, 0o750);
}

async function ensureDkimKey(domain: string, selector: string): Promise<void> {
  const owner = await ownerIds('opendkim');
  const file = dkimKeyPath(domain, selector);
  if (existsSync(file)) return;
  await ensureDkimDir(domain);
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  writeAtomic({ path: file, content: privateKey, mode: 0o600, ...owner });
}

// --- Certificat Let's Encrypt -------------------------------------------------------------------

function writeCertbotHook(hostname: string): void {
  const hook = `#!/bin/sh
# ${CONF_MARKER.slice(2)} : copie le certificat renouvelé pour Postfix, Dovecot et le webmail.
set -e
install -m 0644 "/etc/letsencrypt/live/${hostname}/fullchain.pem" "${TLS_CERT}"
install -m 0600 "/etc/letsencrypt/live/${hostname}/privkey.pem" "${TLS_KEY}"
systemctl reload postfix
systemctl reload dovecot
if [ -e /etc/homeserver-webmail/config.inc.php ]; then
  for unit in apache2 httpd nginx; do
    if systemctl -q is-active "$unit"; then systemctl reload "$unit"; fi
  done
fi
`;
  mkdirSync('/etc/letsencrypt/renewal-hooks/deploy', { recursive: true });
  writeFileSync(CERTBOT_HOOK, hook, { mode: 0o755 });
}

async function issueCertificate(state: MailState, email: string, deps: MailDeps): Promise<void> {
  assertConfigured(state);
  const hostname = state.hostname as string;
  if ((await tryExec('certbot', ['--version'], 15_000)) === null) {
    await deps.pkgRefresh();
    await deps.pkgInstall(['certbot']);
  }
  // Le port 80 appartient au serveur web du panel : on passe par lui s'il tourne
  const plugin = (await serviceActive('apache2')) || (await serviceActive('httpd')) ? 'apache'
    : (await serviceActive('nginx')) ? 'nginx' : 'standalone';
  if (plugin !== 'standalone' && (await tryExec('certbot', ['plugins', '--text'], 30_000))?.includes(plugin) !== true) {
    await deps.pkgInstall([`python3-certbot-${plugin}`]);
  }
  try {
    await exec('certbot', ['certonly', `--${plugin}`, '-d', hostname, '--non-interactive', '--agree-tos', '-m', email, '--keep-until-expiring'], 240_000);
  } catch (e) {
    throw new Error(`Certificat refusé. Vérifie que ${hostname} pointe vers ce serveur et que le port 80 est joignable : ${errText(e).split('\n').slice(-4).join(' ')}`);
  }
  writeCertbotHook(hostname);
  await exec(CERTBOT_HOOK, [], 60_000);
  state.tlsMode = 'letsencrypt';
  saveState(state);
}

// --- Actions ------------------------------------------------------------------------------------

export function handleMail(req: MailRequest, deps: MailDeps): Promise<unknown> {
  switch (req.action) {
    case 'mail_status':
      return status(deps.family);
    case 'mail_setup':
      return locked(async () => {
        const state = loadState();
        await assertNoForeignMailServer(state);
        await installPackages(deps);
        await stopLocalMta(deps);
        const version = await dovecotVersion();
        if (!version) throw new Error('Dovecot introuvable après installation');
        await ensureVmailUser();
        await ensureSelinux(deps);
        mkdirSync(POSTFIX_MAPS, { recursive: true, mode: 0o755 });
        state.hostname = req.hostname;
        await ensureTls(state, req.hostname);
        await configureOpendkim();
        await configureDovecot(version, deps);
        await configurePostfix(req.hostname, state.antispam ?? DEFAULT_ANTISPAM);
        await configureRelay(state.relay ?? null);
        await installPolicyUnit();
        state.configVersion = CONFIG_VERSION;
        await applyState(state, deps);
        await startServices();
        await setFirewall(true, deps).catch((e: Error) => deps.log(`mail : pare-feu non modifié : ${e.message}`));
        await deps.enableMailJails().catch((e: Error) => deps.log(`mail : jails fail2ban non activées : ${e.message}`));
        if (state.webmail?.enabled) await enableWebmail(state.webmail, req.hostname, { cert: TLS_CERT, key: TLS_KEY }, deps);
        deps.log(`mail : service activé (${req.hostname}, Dovecot ${version})`);
        return status(deps.family);
      });
    case 'mail_service':
      return locked(async () => {
        const state = loadState();
        assertConfigured(state);
        const antispam = state.antispam ?? DEFAULT_ANTISPAM;
        if (req.enabled) {
          await startServices();
          await applyAntispam(antispam, deps.family, deps.pkgInstall, deps.pkgRefresh);
        } else {
          for (const unit of allUnits(state, deps.family)) {
            // Redis peut servir à d'autres applications
            if (unit !== 'redis-server' && unit !== 'redis') await exec('systemctl', ['disable', '--now', unit], 60_000);
          }
        }
        await setFirewall(req.enabled, deps).catch((e: Error) => deps.log(`mail : pare-feu non modifié : ${e.message}`));
        return status(deps.family);
      });
    case 'mail_tls_issue':
      return locked(async () => {
        await issueCertificate(loadState(), req.email, deps);
        return status(deps.family);
      });
    case 'mail_domain_list':
      return Promise.resolve().then(async () => ({
        domains: (await Promise.all(Object.entries(loadState().domains)
          .map(async ([domain, d]) => ({ ...domainInfo(domain, d), usedMb: await domainUsedMb(domain) }))))
          .sort((a, b) => a.domain.localeCompare(b.domain)),
      }));
    case 'mail_domain_add':
      return locked(async () => {
        const state = loadState();
        assertConfigured(state);
        if (state.domains[req.domain]) throw new Error(`Le domaine ${req.domain} est déjà activé`);
        await ensureDkimKey(req.domain, DKIM_SELECTOR);
        const d: DomainState = {
          suspended: false,
          defaultQuotaMb: req.defaultQuotaMb,
          maxBoxes: 0,
          sendLimitPerHour: DEFAULT_SEND_LIMIT,
          catchAll: null,
          aliases: {},
          dkimSelector: DKIM_SELECTOR,
          createdAt: new Date().toISOString(),
          boxes: {},
        };
        state.domains[req.domain] = d;
        await applyState(state, deps);
        return domainInfo(req.domain, d);
      });
    case 'mail_domain_set':
      return locked(async () => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        if (req.suspended !== undefined) d.suspended = req.suspended;
        if (req.defaultQuotaMb !== undefined) d.defaultQuotaMb = req.defaultQuotaMb;
        if (req.maxBoxes !== undefined) d.maxBoxes = req.maxBoxes;
        if (req.sendLimitPerHour !== undefined) d.sendLimitPerHour = req.sendLimitPerHour;
        await applyState(state, deps);
        if (d.suspended) for (const local of Object.keys(d.boxes)) await kick(`${local}@${req.domain}`);
        return domainInfo(req.domain, d);
      });
    case 'mail_domain_remove':
      return locked(async () => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        delete state.domains[req.domain];
        for (const address of [...Object.keys(d.boxes), ...Object.keys(d.aliases)]) pruneDestination(state, `${address}@${req.domain}`);
        await applyState(state, deps);
        for (const local of Object.keys(d.boxes)) await kick(`${local}@${req.domain}`);
        if (req.deleteData) {
          rmSync(`${VMAIL_DIR}/${req.domain}`, { recursive: true, force: true });
          rmSync(`${OPENDKIM_DIR}/keys/${req.domain}`, { recursive: true, force: true });
        }
        return { deleted: true, dataDeleted: req.deleteData };
      });
    case 'mail_box_list':
      return Promise.resolve().then(async () => {
        const d = getDomain(loadState(), req.domain);
        const boxes = await Promise.all(Object.entries(d.boxes).map(([local, b]) => boxInfo(req.domain, local, b, d)));
        return { boxes: boxes.sort((a, b) => a.local.localeCompare(b.local)) };
      });
    case 'mail_box_add':
      return locked(async () => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        if (d.boxes[req.local]) throw new Error(`La boîte ${req.local}@${req.domain} existe déjà`);
        if (d.aliases[req.local]) throw new Error(`${req.local}@${req.domain} est déjà un alias`);
        if (d.maxBoxes > 0 && Object.keys(d.boxes).length >= d.maxBoxes) throw new Error(`Limite de ${d.maxBoxes} boîte(s) atteinte pour ${req.domain}`);
        const b: BoxState = {
          hash: await hashPassword(req.password),
          quotaMb: req.quotaMb,
          displayName: req.displayName,
          suspended: false,
          createdAt: new Date().toISOString(),
        };
        d.boxes[req.local] = b;
        await applyState(state, deps);
        return boxInfo(req.domain, req.local, b, d);
      });
    case 'mail_box_set':
      return locked(async () => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        const b = getBox(d, req.domain, req.local);
        if (req.quotaMb !== undefined) b.quotaMb = req.quotaMb;
        if (req.suspended !== undefined) b.suspended = req.suspended;
        if (req.displayName !== undefined) b.displayName = req.displayName;
        if (req.sendLimitPerHour !== undefined) b.sendLimitPerHour = req.sendLimitPerHour;
        await applyState(state, deps);
        if (b.suspended) await kick(`${req.local}@${req.domain}`);
        return boxInfo(req.domain, req.local, b, d);
      });
    case 'mail_box_password':
      return locked(async () => {
        const state = loadState();
        const b = getBox(getDomain(state, req.domain), req.domain, req.local);
        b.hash = await hashPassword(req.password);
        await applyState(state, deps);
        await kick(`${req.local}@${req.domain}`);
        return { updated: true };
      });
    case 'mail_box_remove':
      return locked(async () => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        getBox(d, req.domain, req.local);
        delete d.boxes[req.local];
        pruneDestination(state, `${req.local}@${req.domain}`);
        await applyState(state, deps);
        await kick(`${req.local}@${req.domain}`);
        if (req.deleteData) rmSync(`${VMAIL_DIR}/${req.domain}/${req.local}`, { recursive: true, force: true });
        // Messages conservés : le répondeur, lui, ne doit pas survivre à la boîte
        else await writeVacation(req.domain, req.local, null, []).catch(() => undefined);
        return { deleted: true, dataDeleted: req.deleteData };
      });
    case 'mail_settings_set':
      return locked(async () => {
        const state = loadState();
        assertConfigured(state);
        state.publicIp = req.publicIp;
        saveState(state);
        return status(deps.family);
      });
    case 'mail_relay_set':
      return locked(async () => {
        const state = loadState();
        assertConfigured(state);
        state.relay = { host: req.host, port: req.port, username: req.username, password: req.password, spfInclude: req.spfInclude };
        await configureRelay(state.relay);
        await applyState(state, deps);
        return status(deps.family);
      });
    case 'mail_relay_clear':
      return locked(async () => {
        const state = loadState();
        assertConfigured(state);
        state.relay = null;
        await configureRelay(null);
        await applyState(state, deps);
        return status(deps.family);
      });
    case 'mail_dkim_rotate':
      return locked(async () => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        if (d.dkimPending) return domainInfo(req.domain, d);
        const n = Number(d.dkimSelector.match(/(\d+)$/)?.[1] ?? 1) + 1;
        const selector = `hs${n}`;
        await ensureDkimKey(req.domain, selector);
        d.dkimPending = selector;
        saveState(state);
        return domainInfo(req.domain, d);
      });
    case 'mail_dkim_activate':
      return locked(async () => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        if (!d.dkimPending) throw new Error('Aucune rotation de clé en cours');
        d.dkimSelector = d.dkimPending;
        delete d.dkimPending;
        await applyState(state, deps);
        return domainInfo(req.domain, d);
      });
    case 'mail_webmail_set':
      return locked(async () => {
        const state = loadState();
        assertConfigured(state);
        if (req.enabled) {
          const webmail = state.webmail ?? newWebmailState(req.panelPort);
          webmail.panelPort = req.panelPort;
          await enableWebmail(webmail, state.hostname as string, { cert: TLS_CERT, key: TLS_KEY }, deps);
          webmail.enabled = true;
          state.webmail = webmail;
          if (state.tlsMode === 'letsencrypt') writeCertbotHook(state.hostname as string);
        } else if (state.webmail) {
          await disableWebmail(deps);
          state.webmail.enabled = false;
        }
        saveState(state);
        await deps.enableMailJails().catch((e: Error) => deps.log(`webmail : jail fail2ban non activée : ${e.message}`));
        return status(deps.family);
      });
    case 'mail_box_self_password':
      return locked(async () => {
        const state = loadState();
        if (!state.webmail?.enabled || !secretMatches(state.webmail.secret, req.token)) throw new Error('Accès refusé');
        const [local, domain] = req.address.split('@') as [string, string];
        const b = getBox(getDomain(state, domain), domain, local);
        if (!(await verifyMailPassword(req.address, req.current))) throw new Error('Mot de passe actuel incorrect');
        b.hash = await hashPassword(req.password);
        await applyState(state, deps);
        await kick(req.address);
        return { updated: true };
      });
    case 'mail_antispam_set':
      return locked(async () => {
        const state = loadState();
        assertConfigured(state);
        await upgradeConfig(state, deps);
        antispamAllowed(deps.family, req.config, await rspamdAvailable(deps.family));
        await applyAntispam(req.config, deps.family, deps.pkgInstall, deps.pkgRefresh);
        state.antispam = req.config;
        await configurePostfix(state.hostname as string, req.config);
        await configureRelay(state.relay ?? null);
        await applyState(state, deps);
        return status(deps.family);
      });
    case 'mail_queue_list':
      return queueList();
    case 'mail_queue_action':
      return queueAction(req.queueAction, req.id).then(() => queueList());
    case 'mail_logs':
      return mailLogs(req.query, req.limit);
    case 'mail_backup_list':
      return Promise.resolve().then(() => backupList());
    case 'mail_backup_create':
      return Promise.resolve().then(() => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        if (req.local) {
          return backupCreate(VMAIL_DIR, req.domain, req.local, { kind: 'box', domain: req.domain, local: req.local, box: getBox(d, req.domain, req.local) } satisfies BackupMeta);
        }
        const dkim: Record<string, string> = {};
        for (const selector of [d.dkimSelector, ...(d.dkimPending ? [d.dkimPending] : [])]) {
          dkim[selector] = readFileSync(dkimKeyPath(req.domain, selector), 'utf8');
        }
        return backupCreate(VMAIL_DIR, req.domain, null, { kind: 'domain', domain: req.domain, state: d, dkim } satisfies BackupMeta);
      });
    case 'mail_backup_delete':
      return Promise.resolve().then(() => {
        backupDelete(req.file);
        return { deleted: true };
      });
    case 'mail_backup_restore':
      return locked(async () => {
        const state = loadState();
        assertConfigured(state);
        const { path, meta, domain, local } = await backupRead<BackupMeta>(req.file);
        if (meta.domain !== domain || (meta.kind === 'box') !== (local !== null) || (meta.kind === 'box' && meta.local !== local)) {
          throw new Error('Sauvegarde incohérente : son contenu ne correspond pas à son nom');
        }
        const restored: string[] = [];
        if (meta.kind === 'domain') {
          const existing = state.domains[domain];
          // Rien d'existant n'est écrasé : les boîtes et alias présents gardent leur état actuel
          if (!existing) {
            for (const [selector, pem] of Object.entries(meta.dkim)) {
              if (!/^hs\d+$/.test(selector)) throw new Error('Sauvegarde incohérente : sélecteur DKIM invalide');
              await ensureDkimDir(domain);
              writeAtomic({ path: dkimKeyPath(domain, selector), content: pem, mode: 0o600, ...(await ownerIds('opendkim')) });
            }
            state.domains[domain] = meta.state;
            restored.push(...Object.keys(meta.state.boxes));
          } else {
            for (const [l, b] of Object.entries(meta.state.boxes)) {
              if (!existing.boxes[l] && !existing.aliases[l]) { existing.boxes[l] = b; restored.push(l); }
            }
            for (const [l, a] of Object.entries(meta.state.aliases)) {
              if (!existing.aliases[l] && !existing.boxes[l]) existing.aliases[l] = a;
            }
          }
        } else {
          const d = getDomain(state, domain);
          if (d.aliases[meta.local]) throw new Error(`${meta.local}@${domain} est aujourd'hui un alias`);
          if (!d.boxes[meta.local]) { d.boxes[meta.local] = meta.box; restored.push(meta.local); }
        }
        const { uid, gid } = await vmailIds();
        mkdirSync(`${VMAIL_DIR}/${domain}`, { recursive: true, mode: 0o750 });
        chownSync(`${VMAIL_DIR}/${domain}`, uid, gid);
        await backupExtract(path, VMAIL_DIR, local ? `${domain}/${local}` : domain, uid, gid);
        await applyState(state, deps);
        const boxes = local ? [local] : Object.keys(state.domains[domain]?.boxes ?? {});
        for (const l of boxes) await tryExec('doveadm', ['quota', 'recalc', '-u', `${l}@${domain}`], 60_000);
        return { restored: true, domain, local, recreatedBoxes: restored };
      });
    case 'mail_alias_list':
      return Promise.resolve().then(() => {
        const d = getDomain(loadState(), req.domain);
        const aliases: MailAliasInfo[] = Object.entries(d.aliases)
          .map(([local, a]) => ({ address: `${local}@${req.domain}`, local, destinations: a.destinations, createdAt: a.createdAt }))
          .sort((a, b) => a.local.localeCompare(b.local));
        return { aliases, catchAll: d.catchAll };
      });
    case 'mail_alias_set':
      return locked(async () => {
        const state = loadState();
        await upgradeConfig(state, deps);
        const d = getDomain(state, req.domain);
        const address = `${req.local}@${req.domain}`;
        if (d.boxes[req.local]) throw new Error(`${address} est déjà une boîte`);
        const destinations = [...new Set(req.destinations)];
        if (destinations.includes(address)) throw new Error('Un alias ne peut pas pointer vers lui-même');
        assertLocalDestinations(state, destinations);
        d.aliases[req.local] = { destinations, createdAt: d.aliases[req.local]?.createdAt ?? new Date().toISOString() };
        assertNoLoop(state, address);
        await applyState(state, deps);
        return { address, local: req.local, destinations };
      });
    case 'mail_alias_remove':
      return locked(async () => {
        const state = loadState();
        const d = getDomain(state, req.domain);
        if (!d.aliases[req.local]) throw new Error(`Alias ${req.local}@${req.domain} inconnu`);
        delete d.aliases[req.local];
        pruneDestination(state, `${req.local}@${req.domain}`);
        await applyState(state, deps);
        return { deleted: true };
      });
    case 'mail_catchall_set':
      return locked(async () => {
        const state = loadState();
        await upgradeConfig(state, deps);
        const d = getDomain(state, req.domain);
        if (req.destination) {
          const [, destDomain] = req.destination.split('@') as [string, string];
          // Vers son propre domaine, la destination doit exister vraiment, sinon le courrier tourne en rond
          assertLocalDestinations(state, [req.destination]);
          if (destDomain === req.domain && !d.boxes[req.destination.split('@')[0] as string]) {
            throw new Error('Le catch-all doit pointer vers une boîte du domaine ou une adresse extérieure');
          }
        }
        d.catchAll = req.destination;
        await applyState(state, deps);
        return { catchAll: d.catchAll };
      });
    case 'mail_forward_set':
      return locked(async () => {
        const state = loadState();
        await upgradeConfig(state, deps);
        const d = getDomain(state, req.domain);
        const b = getBox(d, req.domain, req.local);
        const address = `${req.local}@${req.domain}`;
        const destinations = [...new Set(req.destinations)];
        if (destinations.includes(address)) throw new Error('Une boîte ne peut pas se rediriger vers elle-même');
        assertLocalDestinations(state, destinations);
        b.forward = destinations.length > 0 ? { destinations, keepCopy: req.keepCopy } : null;
        assertNoLoop(state, address);
        await applyState(state, deps);
        return boxInfo(req.domain, req.local, b, d);
      });
    case 'mail_vacation_set':
      return locked(async () => {
        const state = loadState();
        await upgradeConfig(state, deps);
        const d = getDomain(state, req.domain);
        const b = getBox(d, req.domain, req.local);
        if (req.startDate && req.endDate && req.endDate < req.startDate) throw new Error('La date de fin précède la date de début');
        const v: MailVacation = { enabled: req.enabled, subject: req.subject, message: req.message, startDate: req.startDate, endDate: req.endDate };
        // Le répondeur répond aussi aux messages reçus via un alias de cette boîte
        const address = `${req.local}@${req.domain}`;
        const addresses = [address, ...Object.entries(d.aliases).filter(([, a]) => a.destinations.includes(address)).map(([l]) => `${l}@${req.domain}`)];
        await writeVacation(req.domain, req.local, v, addresses);
        b.vacation = v;
        saveState(state);
        return boxInfo(req.domain, req.local, b, d);
      });
    case 'mail_test_send':
      return Promise.resolve().then(() => {
        const state = loadState();
        assertConfigured(state);
        getDomain(state, req.domain);
        return sendTestMail(req.domain, req.to);
      });
    default: {
      const unreachable: never = req;
      return Promise.reject(new Error(`Action inconnue : ${JSON.stringify(unreachable)}`));
    }
  }
}
