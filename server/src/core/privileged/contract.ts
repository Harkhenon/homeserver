export const CONTRACT_VERSION = 1;

export type DistroFamily = 'debian' | 'rhel';
export type ServiceVerb = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable';
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
  | { action: 'systemctl'; unit: ServiceUnitName; verb: ServiceVerb };

export type PrivilegedResponse<T = unknown> =
  | { ok: true; data: T; contract_version: number }
  | { ok: false; error: string; code: 'VALIDATION' | 'EXEC' | 'UNKNOWN_ACTION'; contract_version: number };

const PACKAGE_RE = /^[a-z0-9][a-z0-9.+-]{0,99}$/;
const SERVICE_UNITS: readonly ServiceUnitName[] = [
  'apache2', 'httpd', 'nginx', 'bind9', 'named', 'php-fpm', 'mariadb', 'mysqld',
];
const CONFIG_PATH_RE =
  /^\/etc\/(apache2\/sites-(available|enabled)\/[A-Za-z0-9._-]+\.conf|httpd\/conf\.d\/[A-Za-z0-9._-]+\.conf|bind\/zones\/[A-Za-z0-9._-]+\.zone|named\/[A-Za-z0-9._-]+\.zone|homeserver\/[A-Za-z0-9._-]+)$/;

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
    case 'systemctl':
      if (!isServiceUnit(raw.unit)) return null;
      if (typeof raw.verb !== 'string' || !['start', 'stop', 'restart', 'reload', 'enable', 'disable'].includes(raw.verb)) return null;
      return { action: 'systemctl', unit: raw.unit, verb: raw.verb as ServiceVerb };
    default:
      return null;
  }
}

export interface PhpVersionInfo {
  version: string;
  package: string;
  installed: boolean;
  available: boolean;
}

export interface DiscoverPhpResult {
  kind: 'php';
  versions: PhpVersionInfo[];
}

export interface InstallPackagesResult {
  family: DistroFamily;
  installed: string[];
}
