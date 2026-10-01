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

const PACKAGE_RE = /^[a-z0-9][a-z0-9.+-]{0,99}$/;
const SITE_RE = /^[A-Za-z0-9._-]{1,100}\.conf$/;
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
    case 'systemctl':
      if (!isServiceUnit(raw.unit)) return null;
      if (typeof raw.verb !== 'string' || !['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'status'].includes(raw.verb)) return null;
      return { action: 'systemctl', unit: raw.unit, verb: raw.verb as ServiceVerb };
    default:
      return null;
  }
}
