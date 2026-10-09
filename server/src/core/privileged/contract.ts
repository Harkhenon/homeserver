export const CONTRACT_VERSION = 1;

export type DistroFamily = 'debian' | 'rhel';
export type ServiceVerb = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable' | 'status';
export type DiscoverKind = 'php';

export type ServiceUnitName =
  | 'apache2' | 'httpd' | 'nginx'
  | 'bind9' | 'named'
  | 'php-fpm' | 'mariadb' | 'mysqld'
  | 'homeserver' | 'hs-helper';

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
  | { action: 'systemctl'; unit: ServiceUnitName; verb: ServiceVerb };

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
  'homeserver', 'hs-helper',
];
const CONFIG_PATH_RE =  /^\/etc\/((apache2|nginx)\/sites-(available|enabled)|httpd\/(conf\.d|sites-(available|enabled)))\/[A-Za-z0-9._-]+\.conf|\/etc\/(bind\/zones\/[A-Za-z0-9._-]+\.zone|named\/[A-Za-z0-9._-]+\.zone|php\/\d\.\d\/fpm\/pool\.d\/[A-Za-z0-9._-]+\.conf|php-fpm\.d\/[A-Za-z0-9._-]+\.conf|cron.d\/homeserver-[A-Za-z0-9_-]{1,50}|homeserver\/[A-Za-z0-9._-]+)$/;
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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
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
      if (typeof raw.path !== 'string' || !CONFIG_PATH_RE.test(raw.path)) return null;
      if (typeof raw.content !== 'string' || raw.content.length > 1_000_000) return null;
      return { action: 'write_config', path: raw.path, content: raw.content };
    case 'read_file':
      if (typeof raw.path !== 'string' || !CONFIG_PATH_RE.test(raw.path)) return null;
      return { action: 'read_file', path: raw.path };
    case 'list_dir':
      if (typeof raw.path !== 'string') return null;
      if (!(DIR_WHITELIST.includes(raw.path) || /^\/etc\/php\/\d\.\d\/fpm\/pool\.d$/.test(raw.path))) return null;
      return { action: 'list_dir', path: raw.path };
    case 'unlink':
      if (typeof raw.path !== 'string' || !CONFIG_PATH_RE.test(raw.path)) return null;
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
    case 'user_create':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      if (typeof raw.password !== 'string' || raw.password.length < 6 || raw.password.length > 200) return null;
      if (typeof raw.home !== 'string' || !(FS_PATH_RE.test(raw.home) || raw.home === '/dev/null' || /^\/home\/[a-z_][a-z0-9_-]{0,31}$/.test(raw.home))) return null;
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
      if (typeof raw.content !== 'string' || raw.content.length > 10_000 || raw.content.includes('\n\n\n')) return null;
      return { action: 'cron_write', file: raw.file, content: raw.content };
    case 'cron_delete':
      if (typeof raw.file !== 'string' || !CRON_FILE_RE.test(raw.file)) return null;
      return { action: 'cron_delete', file: raw.file };
    case 'systemctl':
      if (!isServiceUnit(raw.unit)) return null;
      if (typeof raw.verb !== 'string' || !['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'status'].includes(raw.verb)) return null;
      return { action: 'systemctl', unit: raw.unit, verb: raw.verb as ServiceVerb };
    default:
      return null;
  }
}
