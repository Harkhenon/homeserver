export const CONTRACT_VERSION = 1;

export type DistroFamily = 'debian' | 'rhel';
export type ServiceVerb = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable' | 'status';
export type DiscoverKind = 'php';

export type ServiceUnitName =
  | 'apache2' | 'httpd' | 'nginx'
  | 'bind9' | 'named'
  | 'php-fpm' | 'mariadb' | 'mysqld';

export type PrivilegedRequest =
  | { action: 'echo' }
  | { action: 'install_packages'; packages: string[] }
  | { action: 'discover'; kind: DiscoverKind }
  | { action: 'write_config'; path: string; content: string }
  | { action: 'read_file'; path: string }
  | { action: 'list_dir'; path: string }
  | { action: 'unlink'; path: string }
  | { action: 'site_enable'; site: string; enable: boolean }
  | { action: 'pending_updates' }
  | { action: 'check_zone'; zone: string; file: string }
  | { action: 'user_create'; username: string; password: string; home: string; shell: string }
  | { action: 'user_delete'; username: string; removeHome: boolean }
  | { action: 'user_list' }
  | { action: 'fs_read'; path: string }
  | { action: 'fs_write'; path: string; content: string }
  | { action: 'fs_list'; path: string }
  | { action: 'fs_mkdir'; path: string }
  | { action: 'fs_delete'; path: string }
  | { action: 'fs_chown'; path: string; owner: string; group: string; recursive: boolean }
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
const UNIX_NAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const FS_PATH_RE = /^\/var\/www(\/[A-Za-z0-9._@ -]+)*\/?$/;
const FS_SUB_RE = /^\/var\/www\/[A-Za-z0-9._@ -][A-Za-z0-9._@ \/-]*$/;

function isSafeFsPath(path: string, re: RegExp): boolean {
  if (!re.test(path)) return false;
  return !path.split('/').includes('..');
}
const SERVICE_UNITS: readonly ServiceUnitName[] = [
  'apache2', 'httpd', 'nginx', 'bind9', 'named', 'php-fpm', 'mariadb', 'mysqld',
];
const CONFIG_PATH_RE =
  /^\/etc\/(apache2\/sites-(available|enabled)\/[A-Za-z0-9._-]+\.conf|httpd\/(conf\.d|sites-(available|enabled))\/[A-Za-z0-9._-]+\.conf|bind\/zones\/[A-Za-z0-9._-]+\.zone|named\/[A-Za-z0-9._-]+\.zone|homeserver\/[A-Za-z0-9._-]+)$/;
const DIR_WHITELIST: readonly string[] = [
  '/etc/apache2/sites-available',
  '/etc/apache2/sites-enabled',
  '/etc/httpd/conf.d',
  '/etc/httpd/sites-available',
  '/etc/httpd/sites-enabled',
  '/etc/bind/zones',
  '/etc/named',
  '/etc/letsencrypt/renewal',
  '/var/www',
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
      if (typeof raw.path !== 'string' || !DIR_WHITELIST.includes(raw.path)) return null;
      return { action: 'list_dir', path: raw.path };
    case 'unlink':
      if (typeof raw.path !== 'string' || !CONFIG_PATH_RE.test(raw.path)) return null;
      return { action: 'unlink', path: raw.path };
    case 'site_enable':
      if (typeof raw.site !== 'string' || !SITE_RE.test(raw.site)) return null;
      if (typeof raw.enable !== 'boolean') return null;
      return { action: 'site_enable', site: raw.site, enable: raw.enable };
    case 'pending_updates':
      return { action: 'pending_updates' };
    case 'check_zone':
      if (typeof raw.zone !== 'string' || !ZONE_NAME_RE.test(raw.zone)) return null;
      if (typeof raw.file !== 'string' || !ZONE_FILE_RE.test(raw.file)) return null;
      return { action: 'check_zone', zone: raw.zone, file: raw.file };
    case 'user_create':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      if (typeof raw.password !== 'string' || raw.password.length < 6 || raw.password.length > 200) return null;
      if (typeof raw.home !== 'string' || !(FS_PATH_RE.test(raw.home) || raw.home === '/dev/null')) return null;
      if (typeof raw.shell !== 'string' || !['/usr/sbin/nologin', '/bin/false', '/bin/bash'].includes(raw.shell)) return null;
      return { action: 'user_create', username: raw.username, password: raw.password, home: raw.home, shell: raw.shell };
    case 'user_delete':
      if (typeof raw.username !== 'string' || !UNIX_NAME_RE.test(raw.username)) return null;
      if (typeof raw.removeHome !== 'boolean') return null;
      return { action: 'user_delete', username: raw.username, removeHome: raw.removeHome };
    case 'user_list':
      return { action: 'user_list' };
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
    case 'systemctl':
      if (!isServiceUnit(raw.unit)) return null;
      if (typeof raw.verb !== 'string' || !['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'status'].includes(raw.verb)) return null;
      return { action: 'systemctl', unit: raw.unit, verb: raw.verb as ServiceVerb };
    default:
      return null;
  }
}
