import { readFileSync, existsSync } from 'node:fs';
import type { DistroFamily } from './types.js';

export interface DistroInfo {
  family: DistroFamily;
  prettyName: string;
}

export function detectDistro(): DistroInfo {
  const osRelease = '/etc/os-release';
  if (!existsSync(osRelease)) return { family: 'unknown', prettyName: 'Unknown' };
  const content = readFileSync(osRelease, 'utf8');
  const get = (key: string): string => {
    const m = content.match(new RegExp(`^${key}=["']?(.+?)["']?$`, 'm'));
    return m?.[1] ?? '';
  };
  const id = get('ID').toLowerCase();
  const prettyName = get('PRETTY_NAME') || 'Unknown';
  const idLike = get('ID_LIKE').toLowerCase();
  if (id.includes('debian') || id.includes('ubuntu') || idLike.includes('debian')) {
    return { family: 'debian', prettyName };
  }
  if (id.includes('fedora') || id.includes('rhel') || id.includes('rocky') || id.includes('almalinux') || id.includes('centos')) {
    return { family: 'rhel', prettyName };
  }
  return { family: 'unknown', prettyName };
}
