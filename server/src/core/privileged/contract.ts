import { isIP } from 'node:net';

export const CONTRACT_VERSION = 1;

export type DistroFamily = 'debian' | 'rhel';
export type ServiceVerb = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable' | 'status';
export type DiscoverKind = 'php';

export type ServiceUnitName =
  | 'apache2' | 'httpd' | 'nginx'
  | 'bind9' | 'named'
  | 'php-fpm' | 'mariadb' | 'mysqld'
  | 'homeserver' | 'hs-helper'
  | 'fail2ban'
  | 'postfix' | 'dovecot' | 'opendkim';

export type PrivilegedRequest =
  | { action: 'echo' }
  | { action: 'install_packages'; packages: string[] }
  | { action: 'discover'; kind: DiscoverKind }
  | { action: 'write_config'; path: string; content: string }
  | { action: 'read_file'; path: string }
  | { action: 'list_dir'; path: string }
  | { action: 'unlink'; path: string }
  | { action: 'site_enable'; site: string; enable: boolean; web: 'apache' | 'nginx' }
  | { action: 'pending_updates' }
  | { action: 'packages_upgrade' }
  | { action: 'check_zone'; zone: string; file: string }
  | { action: 'dns_slaves_config'; slaves: Array<{ name: string; ip: string; external: boolean }> }
  | { action: 'dns_soa_query'; server: string; zone: string }
  | { action: 'user_create'; username: string; password: string; home: string; shell: string }
  | { action: 'user_set_password'; username: string; password: string }
  | { action: 'user_delete'; username: string; removeHome: boolean }
  | { action: 'user_ssh_keys_list'; username: string }
  | { action: 'user_ssh_keys_add'; username: string; key: string }
  | { action: 'user_ssh_keys_remove'; username: string; index: number }
  | { action: 'sftp_configure' }
  | { action: 'user_list' }
  | { action: 'fs_read'; path: string }
  | { action: 'fs_write'; path: string; content: string }
  | { action: 'fs_list'; path: string }
  | { action: 'fs_mkdir'; path: string }
  | { action: 'fs_delete'; path: string }
  | { action: 'fs_chown'; path: string; owner: string; group: string; recursive: boolean }
  | { action: 'packages_remove'; packages: string[] }
  | { action: 'cert_issue'; domain: string; email: string }
  | { action: 'cert_renew'; domain: string }
  | { action: 'cert_info'; domain: string }
  | { action: 'db_query'; sql: 'list_databases' | 'db_size' | 'list_users' | 'list_grants'; arg?: string | undefined }
  | { action: 'db_admin'; op: 'create_db' | 'drop_db' | 'create_user' | 'drop_user' | 'grant' | 'revoke' | 'set_password'; database?: string | undefined; username?: string | undefined; password?: string | undefined }
  | { action: 'firewall_status' }
  | { action: 'firewall_enable'; enable: boolean }
  | { action: 'firewall_rule_add'; port: number; proto: 'tcp' | 'udp'; rule: 'allow' | 'deny' }
  | { action: 'firewall_rule_remove'; port: number; proto: 'tcp' | 'udp'; rule: 'allow' | 'deny' }
  | { action: 'backup_create'; site: string }
  | { action: 'backup_list' }
  | { action: 'backup_delete'; file: string }
  | { action: 'backup_restore'; file: string; site: string }
  | { action: 'cron_write'; file: string; content: string }
  | { action: 'cron_delete'; file: string }
  | { action: 'port_check'; port: number }
  | { action: 'node_app_create'; name: string; port: number; user: string; entry: string }
  | { action: 'node_app_delete'; name: string }
  | { action: 'node_app_list' }
  | { action: 'node_app_service'; name: string; verb: 'start' | 'stop' | 'restart' | 'status' }
  | { action: 'node_app_info'; name: string }
  | { action: 'node_app_update'; name: string; port?: number; entry?: string }
  | { action: 'web_server_detect' }
  | { action: 'panel_check'; force?: boolean }
  | { action: 'panel_update' }
  | { action: 'panel_rollback' }
  | { action: 'panel_releases' }
  | { action: 'panel_release_delete'; version: string }
  | { action: 'panel_access_status' }
  | { action: 'panel_access_set'; host: '0.0.0.0' | '127.0.0.1' }
  | { action: 'panel_https_status' }
  | { action: 'panel_https_setup'; domain: string; email: string }
  | { action: 'panel_https_revert' }
  | { action: 'systemctl'; unit: ServiceUnitName; verb: ServiceVerb }
  | { action: 'ssh_hardening_status' }
  | { action: 'ssh_hardening_apply' }
  | { action: 'ssh_hardening_revert' }
  | { action: 'fail2ban_setup'; web?: 'apache' | 'nginx' }
  | { action: 'fail2ban_status' }
  | { action: 'fail2ban_unban'; ip: string; jail?: Fail2banJailName }
  | { action: 'fail2ban_ban'; ip: string; jail: Fail2banJailName }
  | { action: 'fail2ban_config_get' }
  | { action: 'fail2ban_config_set'; config: Fail2banConfig }
  | { action: 'unattended_upgrades_enable' }
  | MailRequest;

/** Service e-mail (Postfix + Dovecot + OpenDKIM) : voir helper/mail.ts. */
export type MailRequest =
  | { action: 'mail_status' }
  | { action: 'mail_setup'; hostname: string }
  | { action: 'mail_service'; enabled: boolean }
  | { action: 'mail_tls_issue'; email: string }
  | { action: 'mail_domain_list' }
  | { action: 'mail_domain_add'; domain: string; defaultQuotaMb: number }
  | { action: 'mail_domain_set'; domain: string; suspended?: boolean; defaultQuotaMb?: number; maxBoxes?: number; sendLimitPerHour?: number }
  | { action: 'mail_domain_remove'; domain: string; deleteData: boolean }
  | { action: 'mail_box_list'; domain: string }
  | { action: 'mail_box_add'; domain: string; local: string; password: string; quotaMb: number; displayName: string }
  | { action: 'mail_box_set'; domain: string; local: string; quotaMb?: number; suspended?: boolean; displayName?: string; sendLimitPerHour?: number | null }
  | { action: 'mail_box_password'; domain: string; local: string; password: string }
  | { action: 'mail_box_remove'; domain: string; local: string; deleteData: boolean }
  | { action: 'mail_settings_set'; publicIp: string | null }
  | { action: 'mail_relay_set'; host: string; port: number; username: string; password: string; spfInclude: string | null }
  | { action: 'mail_relay_clear' }
  | { action: 'mail_dkim_rotate'; domain: string }
  | { action: 'mail_dkim_activate'; domain: string }
  | { action: 'mail_test_send'; domain: string; to: string }
  | { action: 'mail_alias_list'; domain: string }
  | { action: 'mail_alias_set'; domain: string; local: string; destinations: string[] }
  | { action: 'mail_alias_remove'; domain: string; local: string }
  | { action: 'mail_catchall_set'; domain: string; destination: string | null }
  | { action: 'mail_forward_set'; domain: string; local: string; destinations: string[]; keepCopy: boolean }
  | { action: 'mail_antispam_set'; config: MailAntispamConfig }
  | { action: 'mail_webmail_set'; enabled: boolean; panelPort: number }
  | { action: 'mail_box_self_password'; token: string; address: string; current: string; password: string }
  | { action: 'mail_queue_list' }
  | { action: 'mail_queue_action'; queueAction: 'flush' | 'retry' | 'delete' | 'hold' | 'release'; id?: string }
  | { action: 'mail_logs'; query?: string; limit: number }
  | { action: 'mail_backup_list' }
  | { action: 'mail_backup_create'; domain: string; local: string | null }
  | { action: 'mail_backup_delete'; file: string }
  | { action: 'mail_backup_restore'; file: string }
  | { action: 'mail_vacation_set'; domain: string; local: string; enabled: boolean; subject: string; message: string; startDate: string | null; endDate: string | null };

export interface MailAntispamConfig {
  engine: 'basic' | 'rspamd';
  /** Listes noires (Spamhaus, SpamCop) sur le port 25. */
  rbl: boolean;
  /** Refus des HELO et expéditeurs mal formés ou sans domaine résolvable. */
  strictSender: boolean;
  /** Score Rspamd à partir duquel le message va dans Junk. */
  junkScore: number;
  /** Score Rspamd à partir duquel le message est refusé. */
  rejectScore: number;
  clamav: boolean;
}

export interface MailQueueItem {
  id: string;
  queue: string;
  arrivalAt: string | null;
  sizeBytes: number;
  sender: string;
  recipients: Array<{ address: string; reason: string | null }>;
}

export interface MailQueueResult {
  items: MailQueueItem[];
  total: number;
}

export interface MailLogsResult {
  lines: string[];
}

export interface MailBackupInfo {
  file: string;
  domain: string;
  local: string | null;
  sizeMb: number;
  createdAt: string;
}

export interface MailStatusResult {
  installed: boolean;
  configured: boolean;
  hostname: string | null;
  serverIp: string | null;
  services: Record<string, boolean>;
  dovecotVersion: string | null;
  tls: { mode: 'selfsigned' | 'letsencrypt' | null; expiresAt: string | null };
  /** IP publique saisie (serveur derrière un NAT), sinon null : serverIp fait foi. */
  publicIp: string | null;
  relay: { host: string; port: number; username: string; spfInclude: string | null } | null;
  antispam: MailAntispamConfig;
  webmail: {
    /** Roundcube présent dans les dépôts de la distribution. */
    available: boolean;
    /** Apache ou Nginx actif. */
    webServer: boolean;
    enabled: boolean;
    active: boolean;
    url: string | null;
  };
  rspamdAvailable: boolean;
  memoryMb: number;
  /** Horloge synchronisée par NTP (null : inconnu). Une horloge fausse fausse les dates des messages. */
  clockSynced: boolean | null;
  domainCount: number;
  boxCount: number;
}

export interface MailDomainInfo {
  domain: string;
  suspended: boolean;
  defaultQuotaMb: number;
  boxCount: number;
  dkim: { selector: string; record: string } | null;
  /** Nouvelle clé en cours de rotation : à publier dans le DNS avant de l'activer. */
  dkimPending: { selector: string; record: string } | null;
  maxBoxes: number;
  sendLimitPerHour: number;
  aliasCount: number;
  catchAll: string | null;
  /** Espace total du domaine : seulement dans la liste des domaines (calcul coûteux). */
  usedMb?: number;
  createdAt: string;
}

export interface MailAliasInfo {
  address: string;
  local: string;
  destinations: string[];
  createdAt: string;
}

export interface MailVacation {
  enabled: boolean;
  subject: string;
  message: string;
  startDate: string | null;
  endDate: string | null;
}

export interface MailTestResult {
  messageId: string;
  status: 'sent' | 'deferred' | 'bounced' | 'pending';
  detail: string;
}

export interface MailBoxInfo {
  address: string;
  local: string;
  displayName: string;
  quotaMb: number;
  usedMb: number;
  /** Nombre de messages, null si Dovecot est arrêté. */
  messages: number | null;
  suspended: boolean;
  forward: { destinations: string[]; keepCopy: boolean } | null;
  vacation: MailVacation | null;
  /** Limite propre à la boîte ; null = celle du domaine. */
  sendLimitPerHour: number | null;
  /** Limite réellement appliquée (0 = aucune). */
  effectiveSendLimit: number;
  createdAt: string;
}

export type PrivilegedResponse<T = unknown> =
  | { ok: true; data: T; contract_version: number }
  | { ok: false; error: string; code: 'VALIDATION' | 'EXEC' | 'UNKNOWN_ACTION'; contract_version: number };

export interface DirEntryInfo {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
}

export interface PendingUpdatesResult {
  family: DistroFamily;
  count: number;
  packages: string[];
}

export interface PanelUpdateResult {
  current: string;
  latest: string;
  available: boolean;
  branch: string;
}

export interface PanelUpdateApplyResult {
  updated?: boolean;
  current?: string;
  latest?: string;
  branch?: string;
  active?: boolean;
}

export interface PanelRollbackResult {
  rolledBack?: boolean;
  current?: string;
  /** Redémarrage du panel programmé ~2 s après la réponse */
  restarting?: boolean;
}

export interface PanelReleasesResult {
  releases: string[];
  current: string | null;
  previous: string | null;
}

export interface PanelReleaseDeleteResult {
  deleted: boolean;
  version: string;
}

export interface PanelAccessStatusResult {
  host: string;
  port: number;
  secureCookies: boolean;
  envFile: string | null;
}

export interface PanelAccessSetResult {
  host: '0.0.0.0' | '127.0.0.1';
  secureCookies: boolean;
  envFile: string;
  restarted: boolean;
}

export interface SshHardeningStatusResult {
  passwordAuth: boolean;      // true si SSH accepte encore les mots de passe
  rootLogin: boolean;        // true si root peut se connecter
  dropinApplied: boolean;    // notre drop-in 50-homeserver-hardening.conf est actif
  users: Array<{
    username: string;
    keyCount: number;
    fingerprints: string[];   // empreintes courtes (sha256:xxxx…), jamais la clé complète
  }>;
}

export interface SshHardeningApplyResult {
  applied: boolean;
  passwordAuth: boolean;
  rootLogin: boolean;
  reason?: string;
}

export interface Fail2banStatusResult {
  installed: boolean;
  active: boolean;
  enabled: boolean;          // activé au démarrage (systemctl is-enabled)
  jails: Array<{ name: string; currentlyBanned: number; totalBanned: number; bannedIps: string[] }>;
}

// Jails gérables depuis le panel : filtres livrés avec fail2ban, aucun nom libre.
export const FAIL2BAN_JAILS = [
  'sshd', 'recidive',
  'apache-auth', 'apache-badbots', 'apache-noscript',
  'nginx-http-auth', 'nginx-botsearch',
  'postfix', 'postfix-sasl', 'dovecot', 'roundcube-auth',
] as const;
export type Fail2banJailName = typeof FAIL2BAN_JAILS[number];

export const FAIL2BAN_LIMITS = {
  bantime: { min: 60, max: 31_536_000 },   // 1 min → 1 an (secondes)
  findtime: { min: 60, max: 604_800 },     // 1 min → 7 jours
  maxretry: { min: 1, max: 100 },
  ignoreip: 50,
} as const;

export interface Fail2banTiming {
  bantime: number;
  findtime: number;
  maxretry: number;
}

export interface Fail2banJailConfig {
  name: Fail2banJailName;
  enabled: boolean;
  // null = valeur globale
  bantime: number | null;
  findtime: number | null;
  maxretry: number | null;
}

export interface Fail2banConfig {
  defaults: Fail2banTiming;
  ignoreip: string[];        // IP ou CIDR, en plus de 127.0.0.1/8 et ::1 toujours ignorés
  jails: Fail2banJailConfig[];
}

export interface Fail2banConfigResult {
  installed: boolean;
  config: Fail2banConfig;
  available: Fail2banJailName[];  // jails dont le journal existe sur cette machine
  file: string;
}

export interface ServiceStatusResult {
  unit: string;
  active: boolean;
  enabled: boolean;
}

export interface UserInfo {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
}

export interface FsEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  sizeBytes: number;
  mode: string;
  owner: string;
  group: string;
  modifiedAt: string;
}

const PACKAGE_RE = /^[a-z0-9][a-z0-9.+-]{0,99}$/;
const SITE_RE = /^[A-Za-z0-9._-]{1,100}\.conf$/;
const APP_NAME_RE = /^hs-app-[a-z0-9][a-z0-9-]{0,40}$/;
const APP_ENTRY_RE = /^(?!\.\.)([A-Za-z0-9._/-]{1,200}\.js)$/;
const PORT_RE = /^([1-9][0-9]{0,4})$/;
const UNIX_NAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const FS_PATH_RE = /^(\/var\/www|\/home)(\/[A-Za-z0-9._@ -]+)*\/?$/;
const FS_SUB_RE = /^(\/var\/www|\/home)\/[A-Za-z0-9._@ -][A-Za-z0-9._@ \/-]*$/;

function isSafeFsPath(path: string, re: RegExp): boolean {
  if (!re.test(path)) return false;
  return !path.split('/').includes('..');
}
const SERVICE_UNITS: readonly ServiceUnitName[] = [
  'apache2', 'httpd', 'nginx', 'bind9', 'named', 'php-fpm', 'mariadb', 'mysqld',
  'homeserver', 'hs-helper', 'fail2ban', 'postfix', 'dovecot', 'opendkim',
];
// Ancrée aux deux bouts sur TOUTES les alternatives (l'ancienne version n'ancrait la fin
// que sur la seconde : ".../sites-available/a.conf/../../cron.d/x" passait).
const CONFIG_FILE_RE = /^\/etc\/(?:(?:apache2|nginx)\/sites-(?:available|enabled)\/[A-Za-z0-9._-]+\.conf|httpd\/(?:conf\.d|sites-(?:available|enabled))\/[A-Za-z0-9._-]+\.conf|bind\/zones\/[A-Za-z0-9._-]+\.zone|named\/[A-Za-z0-9._-]+\.zone|php\/\d\.\d\/fpm\/pool\.d\/[A-Za-z0-9._-]+\.conf|php-fpm\.d\/[A-Za-z0-9._-]+\.conf|homeserver\/[A-Za-z0-9_-][A-Za-z0-9._-]*)$/;
const CRON_FILE_PATH_RE = /^\/etc\/cron\.d\/homeserver-[A-Za-z0-9_-]{1,50}$/;
function isSafeConfigPath(path: string): boolean {
  return !path.split('/').some((seg) => seg === '..' || seg === '.');
}
// Écriture/suppression : pas /etc/cron.d (cron_write valide le contenu, write_config ne le ferait pas)
function isConfigPath(path: string): boolean {
  return CONFIG_FILE_RE.test(path) && isSafeConfigPath(path);
}
// Lecture : les tâches cron du panel en plus
function isReadableConfigPath(path: string): boolean {
  return (CONFIG_FILE_RE.test(path) || CRON_FILE_PATH_RE.test(path)) && isSafeConfigPath(path);
}
// Une seule ligne "planification utilisateur commande" : ni variables d'environnement ni
// lignes supplémentaires glissées dans /etc/cron.d
const CRON_LINE_RE = /^(?:@(?:reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)|(?:\S+[ \t]+){4}\S+)[ \t]+[a-z_][a-z0-9_-]{0,31}[ \t]+[^\s=][^\n\r]{0,499}\n?$/;
const DB_NAME_RE = /^[a-zA-Z0-9_]{1,64}$/;
const DB_USER_RE = /^[a-zA-Z0-9_]{1,32}$/;
const CRON_FILE_RE = /^homeserver-[A-Za-z0-9_-]{1,50}$/;
const BACKUP_FILE_RE = /^homeserver-[A-Za-z0-9._-]+\.tar\.gz$/;
const SITE_RE_BIS = /^[a-z0-9][a-z0-9.-]*[a-z0-9](\/[a-z0-9][a-z0-9.-]*[a-z0-9])*$/;

function validatePort(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 65535) return null;
  return v;
}

function validateDbAdmin(raw: Record<string, unknown>): PrivilegedRequest | null {
  const ops = ['create_db', 'drop_db', 'create_user', 'drop_user', 'grant', 'revoke', 'set_password'];
  if (typeof raw.op !== 'string' || !ops.includes(raw.op)) return null;
  const op = raw.op as 'create_db' | 'drop_db' | 'create_user' | 'drop_user' | 'grant' | 'revoke' | 'set_password';
  const needDb = op === 'create_db' || op === 'drop_db' || op === 'grant' || op === 'revoke';
  const needUser = op === 'create_user' || op === 'drop_user' || op === 'grant' || op === 'revoke' || op === 'set_password';
  const needPassword = op === 'create_user' || op === 'set_password';
  let database: string | undefined;
  let username: string | undefined;
  let password: string | undefined;
  if (needDb) {
    if (typeof raw.database !== 'string' || !DB_NAME_RE.test(raw.database)) return null;
    database = raw.database;
  }
  if (needUser) {
    if (typeof raw.username !== 'string' || !DB_USER_RE.test(raw.username) || raw.username === 'root') return null;
    username = raw.username;
  }
  if (needPassword) {
    if (typeof raw.password !== 'string' || raw.password.length < 8 || raw.password.length > 200) return null;
    password = raw.password;
  }
  if (op === 'drop_db' && ['mysql', 'information_schema', 'performance_schema', 'sys'].includes(database ?? '')) return null;
  return { action: 'db_admin', op, database, username, password };
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i;
const PANEL_DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const DIR_WHITELIST: readonly string[] = [
  '/etc/php',
  '/etc/php-fpm.d',
  '/etc/nginx/sites-available',
  '/etc/nginx/sites-enabled',
  '/etc/apache2/sites-available',
  '/etc/apache2/sites-enabled',
  '/etc/httpd/conf.d',
  '/etc/httpd/sites-available',
  '/etc/httpd/sites-enabled',
  '/etc/bind/zones',
  '/etc/named',
  '/etc/letsencrypt/renewal',
  '/var/www',
  '/home',
];

const ZONE_NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.?$/i;
const ZONE_FILE_RE = /^\/etc\/(bind\/zones|named)\/[A-Za-z0-9._-]+\.zone$/;

// --- Service e-mail : ces valeurs finissent dans des maps Postfix/Dovecot et des chemins
// sous /var/vmail. Minuscules seules, pas de séparateur de conf ni de « .. » possible.
const MAIL_DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAIL_LOCAL_RE = /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAIL_ADDRESS_RE = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}$/;
const MAIL_DISPLAY_NAME_RE = /^[\p{L}\p{N} .'_-]{0,64}$/u;
/** Quota en Mo ; 0 = illimité, 10 To maximum. */
const MAIL_MAX_QUOTA_MB = 10_485_760;

function isMailDomain(v: unknown): v is string {
  return typeof v === 'string' && MAIL_DOMAIN_RE.test(v);
}
function isMailLocal(v: unknown): v is string {
  return typeof v === 'string' && MAIL_LOCAL_RE.test(v) && !v.includes('..');
}
function isMailQuota(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAIL_MAX_QUOTA_MB;
}
function isMailDisplayName(v: unknown): v is string {
  return typeof v === 'string' && MAIL_DISPLAY_NAME_RE.test(v);
}
/** Le mot de passe est transmis sur une ligne de stdin : aucun caractère de contrôle. */
function isMailPassword(v: unknown): v is string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' && v.length >= 12 && v.length <= 256 && !/[\x00-\x1f\x7f]/.test(v);
}

// Destination d'alias ou de redirection : écrite telle quelle dans une map Postfix (séparateurs interdits)
const MAIL_DESTINATION_RE = /^[a-z0-9._%+-]{1,64}@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAIL_MAX_DESTINATIONS = 50;
function isMailDestinations(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= MAIL_MAX_DESTINATIONS && v.every((d) => typeof d === 'string' && MAIL_DESTINATION_RE.test(d));
}
function isMailCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;
}
function isMailDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(v);
}
function hasControlChars(v: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1f\x7f]/.test(v);
}

const MAIL_BACKUP_RE = /^mail-[a-z0-9.-]+(\+[a-z0-9._-]+)?-\d{8}T\d{6}\.tar\.gz$/;
function isMailScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 100;
}

const MAIL_RELAY_USER_RE = /^[^\s:]{1,255}$/;
function isMailRelayPassword(v: string): boolean {
  // eslint-disable-next-line no-control-regex
  return v.length <= 512 && !/[\x00-\x1f\x7f]/.test(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isFail2banJail(v: unknown): v is Fail2banJailName {
  return typeof v === 'string' && (FAIL2BAN_JAILS as readonly string[]).includes(v);
}

/** IP v4/v6 seule (pas de zone %eth0, pas d'espaces). */
export function isValidIp(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 45 && /^[0-9a-fA-F:.]+$/.test(v) && isIP(v) !== 0;
}

/** IP ou réseau CIDR (préfixe borné selon la famille). */
export function isValidIpOrCidr(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const [ip, prefix, ...rest] = v.split('/');
  if (rest.length > 0 || !isValidIp(ip)) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (isIP(ip) === 4 ? 32 : 128);
}

function boundedInt(v: unknown, lim: { min: number; max: number }): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lim.min || v > lim.max) return null;
  return v;
}

/** Valide une configuration fail2ban complète (aussi utilisé par le helper pour relire son état). */
export function validateFail2banConfig(raw: unknown): Fail2banConfig | null {
  if (!isObject(raw) || !isObject(raw.defaults) || !Array.isArray(raw.ignoreip) || !Array.isArray(raw.jails)) return null;
  const bantime = boundedInt(raw.defaults.bantime, FAIL2BAN_LIMITS.bantime);
  const findtime = boundedInt(raw.defaults.findtime, FAIL2BAN_LIMITS.findtime);
  const maxretry = boundedInt(raw.defaults.maxretry, FAIL2BAN_LIMITS.maxretry);
  if (bantime === null || findtime === null || maxretry === null) return null;
  if (raw.ignoreip.length > FAIL2BAN_LIMITS.ignoreip || !raw.ignoreip.every(isValidIpOrCidr)) return null;
  const ignoreip = [...new Set(raw.ignoreip as string[])];
  const jails: Fail2banJailConfig[] = [];
  for (const j of raw.jails) {
    if (!isObject(j) || !isFail2banJail(j.name) || typeof j.enabled !== 'boolean') return null;
    const name = j.name;
    if (jails.some((x) => x.name === name)) return null;
    // null/absent = hérite de la valeur globale ; hors bornes = rejet
    const opt = (v: unknown, lim: { min: number; max: number }): number | null | undefined =>
      v === null || v === undefined ? null : boundedInt(v, lim) ?? undefined;
    const jb = opt(j.bantime, FAIL2BAN_LIMITS.bantime);
    const jf = opt(j.findtime, FAIL2BAN_LIMITS.findtime);
    const jm = opt(j.maxretry, FAIL2BAN_LIMITS.maxretry);
    if (jb === undefined || jf === undefined || jm === undefined) return null;
    jails.push({ name, enabled: j.enabled, bantime: jb, findtime: jf, maxretry: jm });
  }
  return { defaults: { bantime, findtime, maxretry }, ignoreip, jails };
}

function isServiceUnit(v: unknown): v is ServiceUnitName {
  return typeof v === 'string' && (SERVICE_UNITS as readonly string[]).includes(v);
}

export function validateRequest(raw: unknown): PrivilegedRequest | null {
  if (!isObject(raw)) return null;
  switch (raw.action) {
    case 'echo':
      return { action: 'echo' };
    case 'install_packages': {
      const packages = raw.packages;
      if (!Array.isArray(packages) || packages.length === 0) return null;
      if (!packages.every((p) => typeof p === 'string' && PACKAGE_RE.test(p))) return null;
      return { action: 'install_packages', packages: packages as string[] };
    }
    case 'discover':
      if (raw.kind !== 'php') return null;
      return { action: 'discover', kind: 'php' };
    case 'write_config':
      if (typeof raw.path !== 'string' || !isConfigPath(raw.path)) return null;
      if (typeof raw.content !== 'string' || raw.content.length > 1_000_000) return null;
      return { action: 'write_config', path: raw.path, content: raw.content };
    case 'read_file':
      if (typeof raw.path !== 'string' || !isReadableConfigPath(raw.path)) return null;
      return { action: 'read_file', path: raw.path };
    case 'list_dir':
      if (typeof raw.path !== 'string') return null;
      if (!(DIR_WHITELIST.includes(raw.path) || /^\/etc\/php\/\d\.\d\/fpm\/pool\.d$/.test(raw.path))) return null;
      return { action: 'list_dir', path: raw.path };
    case 'unlink':
      if (typeof raw.path !== 'string' || !isConfigPath(raw.path)) return null;
      return { action: 'unlink', path: raw.path };
    case 'site_enable':
      if (typeof raw.site !== 'string' || !SITE_RE.test(raw.site)) return null;
      if (typeof raw.enable !== 'boolean') return null;
      if (raw.web !== 'apache' && raw.web !== 'nginx') return null;
      const web = raw.web;
      return { action: 'site_enable', site: raw.site, enable: raw.enable, web };
    case 'port_check':
      if (typeof raw.port !== 'number' || !Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535) return null;
      if (raw.port < 1024) return null;
      return { action: 'port_check', port: raw.port };
    case 'node_app_create':
      if (typeof raw.name !== 'string' || !APP_NAME_RE.test(raw.name)) return null;
      if (typeof raw.port !== 'number' || !Number.isInteger(raw.port) || raw.port < 1024 || raw.port > 65535) return null;
      if (typeof raw.user !== 'string' || !UNIX_NAME_RE.test(raw.user) || raw.user === 'root') return null;
      if (typeof raw.entry !== 'string' || !APP_ENTRY_RE.test(raw.entry) || raw.entry.includes('..')) return null;
      return { action: 'node_app_create', name: raw.name, port: raw.port, user: raw.user, entry: raw.entry };
    case 'node_app_delete':
      if (typeof raw.name !== 'string' || !APP_NAME_RE.test(raw.name)) return null;
      return { action: 'node_app_delete', name: raw.name };
    case 'node_app_list':
      return { action: 'node_app_list' };
    case 'node_app_service':
      if (typeof raw.name !== 'string' || !APP_NAME_RE.test(raw.name)) return null;
      if (typeof raw.verb !== 'string' || !['start', 'stop', 'restart', 'status'].includes(raw.verb)) return null;
      return { action: 'node_app_service', name: raw.name, verb: raw.verb as 'start' | 'stop' | 'restart' | 'status' };
    case 'node_app_info':
      if (typeof raw.name !== 'string' || !APP_NAME_RE.test(raw.name)) return null;
      return { action: 'node_app_info', name: raw.name };
    case 'node_app_update': {
      if (typeof raw.name !== 'string' || !APP_NAME_RE.test(raw.name)) return null;
      const port = typeof raw.port === 'number' && Number.isInteger(raw.port) && raw.port >= 1024 && raw.port <= 65535 ? raw.port : undefined;
      const entry = typeof raw.entry === 'string' && APP_ENTRY_RE.test(raw.entry) && !raw.entry.includes('..') ? raw.entry : undefined;
      if (port === undefined && entry === undefined) return null;
      return { action: 'node_app_update', name: raw.name, ...(port !== undefined ? { port } : {}), ...(entry !== undefined ? { entry } : {}) };
    }
    case 'web_server_detect':
      return { action: 'web_server_detect' };
    case 'pending_updates':
      return { action: 'pending_updates' };
    case 'packages_upgrade':
      return { action: 'packages_upgrade' };
    case 'check_zone':
      if (typeof raw.zone !== 'string' || !ZONE_NAME_RE.test(raw.zone)) return null;
      if (typeof raw.file !== 'string' || !ZONE_FILE_RE.test(raw.file)) return null;
      return { action: 'check_zone', zone: raw.zone, file: raw.file };
    case 'dns_slaves_config': {
      if (!Array.isArray(raw.slaves)) return null;
      const slaves: Array<{ name: string; ip: string; external: boolean }> = []
      for (const s of raw.slaves) {
        if (!s || typeof s !== 'object') return null;
        const so = s as Record<string, unknown>;
        if (typeof so.name !== 'string' || so.name.length === 0 || so.name.length > 253 || !/^[a-zA-Z0-9._-]+$/.test(so.name)) return null;
        if (typeof so.ip !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(so.ip)) return null;
        const parts = so.ip.split('.').map(Number);
        if (parts.some((n) => n > 255)) return null;
        slaves.push({ name: so.name, ip: so.ip, external: so.external === true });
      }
      if (slaves.length > 16) return null;
      return { action: 'dns_slaves_config', slaves };
    }
    case 'dns_soa_query':
      if (typeof raw.server !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(raw.server)) return null;
      if (typeof raw.zone !== 'string' || !ZONE_NAME_RE.test(raw.zone)) return null;
      return { action: 'dns_soa_query', server: raw.server, zone: raw.zone };
    case 'user_create':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      if (typeof raw.password !== 'string' || raw.password.length < 6 || raw.password.length > 200) return null;
      // HOME imposé (/home/<utilisateur>) : un HOME arbitraire sous /var/www ou /home serait chowné
      if (typeof raw.home !== 'string' || !(raw.home === '/dev/null' || raw.home === `/home/${raw.username}`)) return null;
      if (typeof raw.shell !== 'string' || !['/usr/sbin/nologin', '/bin/false', '/bin/bash'].includes(raw.shell)) return null;
      return { action: 'user_create', username: raw.username, password: raw.password, home: raw.home, shell: raw.shell };
    case 'user_set_password':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      if (typeof raw.password !== 'string' || raw.password.length < 8 || raw.password.length > 200) return null;
      return { action: 'user_set_password', username: raw.username, password: raw.password };
    case 'user_delete':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      if (typeof raw.removeHome !== 'boolean') return null;
      return { action: 'user_delete', username: raw.username, removeHome: raw.removeHome };
    case 'user_list':
      return { action: 'user_list' };
    case 'user_ssh_keys_list':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      return { action: 'user_ssh_keys_list', username: raw.username };
    case 'user_ssh_keys_add':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      if (typeof raw.key !== 'string' || raw.key.length < 50 || raw.key.length > 10_000 || raw.key.includes('\n')) return null;
      return { action: 'user_ssh_keys_add', username: raw.username, key: raw.key.trim() };
    case 'user_ssh_keys_remove':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      if (typeof raw.index !== 'number' || !Number.isInteger(raw.index) || raw.index < 0) return null;
      return { action: 'user_ssh_keys_remove', username: raw.username, index: raw.index };
    case 'sftp_configure':
      return { action: 'sftp_configure' };
    case 'fs_read':
      if (typeof raw.path !== 'string' || !isSafeFsPath(raw.path, FS_SUB_RE)) return null;
      return { action: 'fs_read', path: raw.path };
    case 'fs_write':
      if (typeof raw.path !== 'string' || !isSafeFsPath(raw.path, FS_SUB_RE)) return null;
      if (typeof raw.content !== 'string' || raw.content.length > 5_000_000) return null;
      return { action: 'fs_write', path: raw.path, content: raw.content };
    case 'fs_list':
      if (typeof raw.path !== 'string' || !isSafeFsPath(raw.path, FS_PATH_RE)) return null;
      return { action: 'fs_list', path: raw.path };
    case 'fs_mkdir':
      if (typeof raw.path !== 'string' || !isSafeFsPath(raw.path, FS_SUB_RE)) return null;
      return { action: 'fs_mkdir', path: raw.path };
    case 'fs_delete':
      if (typeof raw.path !== 'string' || !isSafeFsPath(raw.path, FS_SUB_RE) || raw.path.replace(/\/+$/, '') === '/var/www') return null;
      return { action: 'fs_delete', path: raw.path };
    case 'fs_chown':
      if (typeof raw.path !== 'string' || !isSafeFsPath(raw.path, FS_PATH_RE)) return null;
      if (typeof raw.owner !== 'string' || !UNIX_NAME_RE.test(raw.owner)) return null;
      if (typeof raw.group !== 'string' || !UNIX_NAME_RE.test(raw.group)) return null;
      if (typeof raw.recursive !== 'boolean') return null;
      return { action: 'fs_chown', path: raw.path, owner: raw.owner, group: raw.group, recursive: raw.recursive };
    case 'packages_remove': {
      const packages = raw.packages;
      if (!Array.isArray(packages) || packages.length === 0) return null;
      if (!packages.every((p) => typeof p === 'string' && PACKAGE_RE.test(p) && p.startsWith('php'))) return null;
      return { action: 'packages_remove', packages: packages as string[] };
    }
    case 'cert_issue':
      if (typeof raw.domain !== 'string' || !ZONE_NAME_RE.test(raw.domain)) return null;
      if (typeof raw.email !== 'string' || !EMAIL_RE.test(raw.email)) return null;
      return { action: 'cert_issue', domain: raw.domain, email: raw.email };
    case 'cert_renew':
      if (typeof raw.domain !== 'string' || !ZONE_NAME_RE.test(raw.domain)) return null;
      return { action: 'cert_renew', domain: raw.domain };
    case 'cert_info':
      if (typeof raw.domain !== 'string' || !ZONE_NAME_RE.test(raw.domain)) return null;
      return { action: 'cert_info', domain: raw.domain };
    case 'db_query':
      if (typeof raw.sql !== 'string' || !['list_databases', 'db_size', 'list_users', 'list_grants'].includes(raw.sql)) return null;
      if (raw.arg !== undefined && typeof raw.arg !== 'string') return null;
      if (raw.sql === 'db_size' && (typeof raw.arg !== 'string' || !DB_NAME_RE.test(raw.arg))) return null;
      return { action: 'db_query', sql: raw.sql as 'list_databases' | 'db_size' | 'list_users' | 'list_grants', arg: raw.arg as string | undefined };
    case 'db_admin':
      return validateDbAdmin(raw);
    case 'firewall_status':
      return { action: 'firewall_status' };
    case 'firewall_enable':
      if (typeof raw.enable !== 'boolean') return null;
      return { action: 'firewall_enable', enable: raw.enable };
    case 'firewall_rule_add':
    case 'firewall_rule_remove': {
      const port = validatePort(raw.port);
      if (port === null) return null;
      if (raw.proto !== 'tcp' && raw.proto !== 'udp') return null;
      if (raw.rule !== 'allow' && raw.rule !== 'deny') return null;
      if (port === 22 || port === (Number(process.env.HS_PORT) || 3000)) return null;
      return raw.action === 'firewall_rule_add'
        ? { action: 'firewall_rule_add', port, proto: raw.proto as 'tcp' | 'udp', rule: raw.rule as 'allow' }
        : { action: 'firewall_rule_remove', port, proto: raw.proto as 'tcp' | 'udp', rule: raw.rule as 'deny' };
    }
    case 'backup_create':
      if (typeof raw.site !== 'string' || !SITE_RE_BIS.test(raw.site)) return null;
      return { action: 'backup_create', site: raw.site };
    case 'backup_list':
      return { action: 'backup_list' };
    case 'backup_delete':
      if (typeof raw.file !== 'string' || !BACKUP_FILE_RE.test(raw.file)) return null;
      return { action: 'backup_delete', file: raw.file };
    case 'backup_restore':
      if (typeof raw.file !== 'string' || !BACKUP_FILE_RE.test(raw.file)) return null;
      if (typeof raw.site !== 'string' || !SITE_RE_BIS.test(raw.site)) return null;
      return { action: 'backup_restore', file: raw.file, site: raw.site };
    case 'cron_write':
      if (typeof raw.file !== 'string' || !CRON_FILE_RE.test(raw.file)) return null;
      if (typeof raw.content !== 'string' || !CRON_LINE_RE.test(raw.content)) return null;
      return { action: 'cron_write', file: raw.file, content: raw.content };
    case 'cron_delete':
      if (typeof raw.file !== 'string' || !CRON_FILE_RE.test(raw.file)) return null;
      return { action: 'cron_delete', file: raw.file };
    case 'panel_check':
      if (raw.force !== undefined && typeof raw.force !== 'boolean') return null;
      return { action: 'panel_check', force: raw.force === true };
    case 'panel_update':
      return { action: 'panel_update' };
    case 'panel_rollback':
      return { action: 'panel_rollback' };
    case 'panel_releases':
      return { action: 'panel_releases' };
    case 'panel_release_delete': {
      if (typeof raw.version !== 'string' || !/^[0-9][0-9A-Za-z.-]{0,31}$/.test(raw.version)) return null;
      return { action: 'panel_release_delete', version: raw.version };
    }
    case 'panel_access_status':
      return { action: 'panel_access_status' };
    case 'panel_access_set':
      if (raw.host !== '0.0.0.0' && raw.host !== '127.0.0.1') return null;
      return { action: 'panel_access_set', host: raw.host };
    case 'panel_https_status':
      return { action: 'panel_https_status' };
    case 'panel_https_setup': {
      if (typeof raw.domain !== 'string' || !PANEL_DOMAIN_RE.test(raw.domain)) return null;
      if (typeof raw.email !== 'string' || !EMAIL_RE.test(raw.email)) return null;
      return { action: 'panel_https_setup', domain: raw.domain.toLowerCase(), email: raw.email };
    }
    case 'panel_https_revert':
      return { action: 'panel_https_revert' };
    case 'systemctl':
      if (!isServiceUnit(raw.unit)) return null;
      if (typeof raw.verb !== 'string' || !['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'status'].includes(raw.verb)) return null;
      // Le helper ne peut être ni arrêté ni désactivé depuis le panel (il ne reviendrait pas)
      if (raw.unit === 'hs-helper' && !['restart', 'status'].includes(raw.verb)) return null;
      return { action: 'systemctl', unit: raw.unit, verb: raw.verb as ServiceVerb };
    case 'ssh_hardening_status':
      return { action: 'ssh_hardening_status' };
    case 'ssh_hardening_apply':
      return { action: 'ssh_hardening_apply' };
    case 'ssh_hardening_revert':
      return { action: 'ssh_hardening_revert' };
    case 'fail2ban_setup':
      if (raw.web !== undefined && raw.web !== 'apache' && raw.web !== 'nginx') return null;
      return raw.web ? { action: 'fail2ban_setup', web: raw.web } : { action: 'fail2ban_setup' };
    case 'fail2ban_status':
      return { action: 'fail2ban_status' };
    case 'fail2ban_unban':
      if (!isValidIp(raw.ip)) return null;
      if (raw.jail !== undefined && !isFail2banJail(raw.jail)) return null;
      return raw.jail ? { action: 'fail2ban_unban', ip: raw.ip, jail: raw.jail } : { action: 'fail2ban_unban', ip: raw.ip };
    case 'fail2ban_ban':
      if (!isValidIp(raw.ip) || !isFail2banJail(raw.jail)) return null;
      return { action: 'fail2ban_ban', ip: raw.ip, jail: raw.jail };
    case 'fail2ban_config_get':
      return { action: 'fail2ban_config_get' };
    case 'fail2ban_config_set': {
      const config = validateFail2banConfig(raw.config);
      if (!config) return null;
      return { action: 'fail2ban_config_set', config };
    }
    case 'unattended_upgrades_enable':
      return { action: 'unattended_upgrades_enable' };
    case 'mail_status':
      return { action: 'mail_status' };
    case 'mail_setup':
      if (!isMailDomain(raw.hostname)) return null;
      return { action: 'mail_setup', hostname: raw.hostname };
    case 'mail_service':
      if (typeof raw.enabled !== 'boolean') return null;
      return { action: 'mail_service', enabled: raw.enabled };
    case 'mail_tls_issue':
      if (typeof raw.email !== 'string' || !MAIL_ADDRESS_RE.test(raw.email)) return null;
      return { action: 'mail_tls_issue', email: raw.email };
    case 'mail_domain_list':
      return { action: 'mail_domain_list' };
    case 'mail_domain_add':
      if (!isMailDomain(raw.domain) || !isMailQuota(raw.defaultQuotaMb)) return null;
      return { action: 'mail_domain_add', domain: raw.domain, defaultQuotaMb: raw.defaultQuotaMb };
    case 'mail_domain_set': {
      if (!isMailDomain(raw.domain)) return null;
      if (raw.suspended !== undefined && typeof raw.suspended !== 'boolean') return null;
      if (raw.defaultQuotaMb !== undefined && !isMailQuota(raw.defaultQuotaMb)) return null;
      if (raw.maxBoxes !== undefined && !isMailCount(raw.maxBoxes)) return null;
      if (raw.sendLimitPerHour !== undefined && !isMailCount(raw.sendLimitPerHour)) return null;
      return {
        action: 'mail_domain_set',
        domain: raw.domain,
        ...(raw.suspended !== undefined ? { suspended: raw.suspended } : {}),
        ...(raw.defaultQuotaMb !== undefined ? { defaultQuotaMb: raw.defaultQuotaMb } : {}),
        ...(raw.maxBoxes !== undefined ? { maxBoxes: raw.maxBoxes } : {}),
        ...(raw.sendLimitPerHour !== undefined ? { sendLimitPerHour: raw.sendLimitPerHour } : {}),
      };
    }
    case 'mail_domain_remove':
      if (!isMailDomain(raw.domain) || typeof raw.deleteData !== 'boolean') return null;
      return { action: 'mail_domain_remove', domain: raw.domain, deleteData: raw.deleteData };
    case 'mail_box_list':
      if (!isMailDomain(raw.domain)) return null;
      return { action: 'mail_box_list', domain: raw.domain };
    case 'mail_box_add':
      if (!isMailDomain(raw.domain) || !isMailLocal(raw.local) || !isMailPassword(raw.password)) return null;
      if (!isMailQuota(raw.quotaMb) || !isMailDisplayName(raw.displayName)) return null;
      return { action: 'mail_box_add', domain: raw.domain, local: raw.local, password: raw.password, quotaMb: raw.quotaMb, displayName: raw.displayName };
    case 'mail_box_set': {
      if (!isMailDomain(raw.domain) || !isMailLocal(raw.local)) return null;
      if (raw.quotaMb !== undefined && !isMailQuota(raw.quotaMb)) return null;
      if (raw.suspended !== undefined && typeof raw.suspended !== 'boolean') return null;
      if (raw.displayName !== undefined && !isMailDisplayName(raw.displayName)) return null;
      if (raw.sendLimitPerHour !== undefined && raw.sendLimitPerHour !== null && !isMailCount(raw.sendLimitPerHour)) return null;
      return {
        action: 'mail_box_set',
        domain: raw.domain,
        local: raw.local,
        ...(raw.quotaMb !== undefined ? { quotaMb: raw.quotaMb } : {}),
        ...(raw.suspended !== undefined ? { suspended: raw.suspended } : {}),
        ...(raw.displayName !== undefined ? { displayName: raw.displayName } : {}),
        ...(raw.sendLimitPerHour !== undefined ? { sendLimitPerHour: raw.sendLimitPerHour } : {}),
      };
    }
    case 'mail_box_password':
      if (!isMailDomain(raw.domain) || !isMailLocal(raw.local) || !isMailPassword(raw.password)) return null;
      return { action: 'mail_box_password', domain: raw.domain, local: raw.local, password: raw.password };
    case 'mail_box_remove':
      if (!isMailDomain(raw.domain) || !isMailLocal(raw.local) || typeof raw.deleteData !== 'boolean') return null;
      return { action: 'mail_box_remove', domain: raw.domain, local: raw.local, deleteData: raw.deleteData };
    case 'mail_settings_set':
      if (raw.publicIp !== null && !isValidIp(raw.publicIp)) return null;
      return { action: 'mail_settings_set', publicIp: raw.publicIp };
    case 'mail_relay_set': {
      if (!isMailDomain(raw.host) && !isValidIp(raw.host)) return null;
      if (raw.port !== 25 && raw.port !== 465 && raw.port !== 587 && raw.port !== 2525) return null;
      if (typeof raw.username !== 'string' || !MAIL_RELAY_USER_RE.test(raw.username)) return null;
      if (typeof raw.password !== 'string' || raw.password.length < 1 || !isMailRelayPassword(raw.password)) return null;
      if (raw.spfInclude !== null && !isMailDomain(raw.spfInclude)) return null;
      return { action: 'mail_relay_set', host: raw.host as string, port: raw.port, username: raw.username, password: raw.password, spfInclude: raw.spfInclude };
    }
    case 'mail_relay_clear':
      return { action: 'mail_relay_clear' };
    case 'mail_dkim_rotate':
      if (!isMailDomain(raw.domain)) return null;
      return { action: 'mail_dkim_rotate', domain: raw.domain };
    case 'mail_dkim_activate':
      if (!isMailDomain(raw.domain)) return null;
      return { action: 'mail_dkim_activate', domain: raw.domain };
    case 'mail_test_send':
      if (!isMailDomain(raw.domain) || typeof raw.to !== 'string' || !MAIL_ADDRESS_RE.test(raw.to)) return null;
      return { action: 'mail_test_send', domain: raw.domain, to: raw.to };
    case 'mail_alias_list':
      if (!isMailDomain(raw.domain)) return null;
      return { action: 'mail_alias_list', domain: raw.domain };
    case 'mail_alias_set':
      if (!isMailDomain(raw.domain) || !isMailLocal(raw.local) || !isMailDestinations(raw.destinations) || raw.destinations.length === 0) return null;
      return { action: 'mail_alias_set', domain: raw.domain, local: raw.local, destinations: raw.destinations };
    case 'mail_alias_remove':
      if (!isMailDomain(raw.domain) || !isMailLocal(raw.local)) return null;
      return { action: 'mail_alias_remove', domain: raw.domain, local: raw.local };
    case 'mail_catchall_set':
      if (!isMailDomain(raw.domain)) return null;
      if (raw.destination !== null && !(typeof raw.destination === 'string' && isMailDestinations([raw.destination]))) return null;
      return { action: 'mail_catchall_set', domain: raw.domain, destination: raw.destination };
    case 'mail_forward_set':
      if (!isMailDomain(raw.domain) || !isMailLocal(raw.local) || !isMailDestinations(raw.destinations) || typeof raw.keepCopy !== 'boolean') return null;
      return { action: 'mail_forward_set', domain: raw.domain, local: raw.local, destinations: raw.destinations, keepCopy: raw.keepCopy };
    case 'mail_webmail_set':
      if (typeof raw.enabled !== 'boolean' || typeof raw.panelPort !== 'number' || !Number.isInteger(raw.panelPort) || raw.panelPort < 1 || raw.panelPort > 65535) return null;
      return { action: 'mail_webmail_set', enabled: raw.enabled, panelPort: raw.panelPort };
    case 'mail_box_self_password':
      if (typeof raw.token !== 'string' || !/^[0-9a-f]{64}$/.test(raw.token)) return null;
      if (typeof raw.address !== 'string' || raw.address.length > 254 || !MAIL_ADDRESS_RE.test(raw.address)) return null;
      if (typeof raw.current !== 'string' || raw.current.length < 1 || raw.current.length > 1024 || hasControlChars(raw.current)) return null;
      if (!isMailPassword(raw.password)) return null;
      return { action: 'mail_box_self_password', token: raw.token, address: raw.address, current: raw.current, password: raw.password };
    case 'mail_antispam_set': {
      const c = raw.config;
      if (!isObject(c)) return null;
      if ((c.engine !== 'basic' && c.engine !== 'rspamd') || typeof c.rbl !== 'boolean' || typeof c.strictSender !== 'boolean' || typeof c.clamav !== 'boolean') return null;
      if (!isMailScore(c.junkScore) || !isMailScore(c.rejectScore) || c.junkScore >= c.rejectScore) return null;
      return { action: 'mail_antispam_set', config: { engine: c.engine, rbl: c.rbl, strictSender: c.strictSender, junkScore: c.junkScore, rejectScore: c.rejectScore, clamav: c.clamav } };
    }
    case 'mail_queue_list':
      return { action: 'mail_queue_list' };
    case 'mail_queue_action': {
      const a = raw.queueAction;
      if (a !== 'flush' && a !== 'retry' && a !== 'delete' && a !== 'hold' && a !== 'release') return null;
      if (raw.id !== undefined && (typeof raw.id !== 'string' || !/^[0-9A-Za-z]{5,32}$/.test(raw.id))) return null;
      return { action: 'mail_queue_action', queueAction: a, ...(raw.id !== undefined ? { id: raw.id } : {}) };
    }
    case 'mail_logs':
      if (raw.query !== undefined && (typeof raw.query !== 'string' || raw.query.length > 254 || hasControlChars(raw.query))) return null;
      if (typeof raw.limit !== 'number' || !Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 2000) return null;
      return { action: 'mail_logs', limit: raw.limit, ...(raw.query !== undefined ? { query: raw.query } : {}) };
    case 'mail_backup_list':
      return { action: 'mail_backup_list' };
    case 'mail_backup_create':
      if (!isMailDomain(raw.domain) || (raw.local !== null && !isMailLocal(raw.local))) return null;
      return { action: 'mail_backup_create', domain: raw.domain, local: raw.local };
    case 'mail_backup_delete':
      if (typeof raw.file !== 'string' || !MAIL_BACKUP_RE.test(raw.file)) return null;
      return { action: 'mail_backup_delete', file: raw.file };
    case 'mail_backup_restore':
      if (typeof raw.file !== 'string' || !MAIL_BACKUP_RE.test(raw.file)) return null;
      return { action: 'mail_backup_restore', file: raw.file };
    case 'mail_vacation_set': {
      if (!isMailDomain(raw.domain) || !isMailLocal(raw.local) || typeof raw.enabled !== 'boolean') return null;
      if (typeof raw.subject !== 'string' || raw.subject.length > 200 || hasControlChars(raw.subject)) return null;
      // Le corps peut contenir des retours à la ligne, aucun autre caractère de contrôle
      if (typeof raw.message !== 'string' || raw.message.length > 5000 || hasControlChars(raw.message.replace(/\r?\n/g, ''))) return null;
      if (raw.startDate !== null && !isMailDate(raw.startDate)) return null;
      if (raw.endDate !== null && !isMailDate(raw.endDate)) return null;
      if (raw.enabled && (raw.subject.trim() === '' || raw.message.trim() === '')) return null;
      return { action: 'mail_vacation_set', domain: raw.domain, local: raw.local, enabled: raw.enabled, subject: raw.subject, message: raw.message, startDate: raw.startDate, endDate: raw.endDate };
    }
    default:
      return null;
  }
}
