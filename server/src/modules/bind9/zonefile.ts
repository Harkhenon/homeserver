// Lecture et écriture des fichiers de zone Bind : partagé entre les modules bind9 et mail.
import { existsSync } from 'node:fs';
import { callHelper } from '../../core/privileged/client.js';
import type { DirEntryInfo } from '../../core/privileged/contract.js';
import { platform } from '../../core/platform/index.js';

export const BIND_UNIT = platform.serviceName('bind9') as 'bind9' | 'named';
// /etc/bind/zones (créé à la première zone) : AppArmor interdit à named de lire ailleurs sur Debian/Ubuntu
export const ZONES_DIR = existsSync('/etc/bind') ? '/etc/bind/zones' : '/etc/named';
export const ZONE_FILE_RE = /^[A-Za-z0-9._-]+\.zone$/;
export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Limite DNS d'une chaîne TXT : au-delà (clé DKIM), le contenu est découpé en plusieurs chaînes. */
const TXT_CHUNK = 250;

export interface DnsRecord {
  name: string;
  type: RecordType;
  value: string;
  ttl: number;
}

export interface Zone {
  id: string;
  domain: string;
  file: string;
  serial: number;
  records: DnsRecord[];
}

export function zoneFilePath(domain: string): string {
  return `${ZONES_DIR}/${domain}.zone`;
}

function escapeZoneValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

/** Chaînes TXT du fichier de zone ("a" "b") → valeur complète. */
function parseTxtValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  const parts = [...trimmed.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? '');
  return parts.join('').replace(/\\"/g, '"');
}

function renderTxtValue(value: string): string {
  if (value.startsWith('"')) return value;
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += TXT_CHUNK) chunks.push(`"${escapeZoneValue(value.slice(i, i + TXT_CHUNK))}"`);
  return chunks.join(' ') || '""';
}

export function parseZone(file: string, content: string): Zone {
  const id = file.replace(/\.zone$/, '');
  const records: DnsRecord[] = [];
  let serial = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('$')) {
      continue;
    }
    if (/^\d{10}\s*;/.test(trimmed)) {
      serial = Number(trimmed.slice(0, 10));
      continue;
    }
    if (trimmed.includes('Serial')) {
      const parts = trimmed.split(/\s+/);
      for (const p of parts) if (/^\d{10}$/.test(p)) serial = Number(p);
      continue;
    }
    const soa = trimmed.match(/^@\s+IN\s+SOA/i);
    if (soa) continue;
    const m = trimmed.match(/^(?:([A-Za-z0-9@*._-]+)\s+)?(?:(\d+)\s+)?IN\s+([A-Z]{1,5})\s+(.+)$/);
    if (!m) continue;
    const type = (m[3] ?? '').toUpperCase() as RecordType;
    if (!RECORD_TYPES.includes(type)) continue;
    records.push({
      name: m[1] ?? '@',
      type,
      ttl: m[2] ? Number(m[2]) : 3600,
      value: type === 'TXT' ? parseTxtValue(m[4] ?? '') : (m[4] ?? '').trim(),
    });
  }
  return { id, domain: id, file, serial, records };
}

export function renderZone(domain: string, records: DnsRecord[], serial: number): string {
  const lines = [
    `$ORIGIN ${domain}.`,
    '$TTL 3600',
    `@ IN SOA ns1.${domain}. hostmaster.${domain}. (`,
    `  ${serial}   ; serial`,
    '  7200       ; refresh',
    '  3600       ; retry',
    '  1209600    ; expire',
    '  3600 )     ; ttl negative',
    '',
  ];
  for (const r of records) {
    const name = r.name === '@' ? '@' : r.name;
    const value = r.type === 'TXT' ? renderTxtValue(r.value) : r.value;
    lines.push(`${name} ${r.ttl} IN ${r.type} ${value}`);
  }
  return lines.join('\n') + '\n';
}

export async function listZoneFiles(): Promise<string[]> {
  const res = await callHelper<{ entries: DirEntryInfo[] }>({ action: 'list_dir', path: ZONES_DIR });
  return (res.entries ?? []).filter((e) => e.type === 'file' && ZONE_FILE_RE.test(e.name)).map((e) => e.name);
}

export async function readZone(file: string): Promise<string> {
  const res = await callHelper<{ content: string }>({ action: 'read_file', path: `${ZONES_DIR}/${file}` });
  return res.content;
}

export async function loadZone(id: string): Promise<Zone> {
  const file = id.endsWith('.zone') ? id : `${id}.zone`;
  if (!ZONE_FILE_RE.test(file)) throw new Error('Identifiant de zone invalide');
  const content = await readZone(file);
  return parseZone(file, content);
}

/** Écrit la zone puis la valide : un contenu refusé restaure la version précédente, jamais de perte. */
export async function writeZoneChecked(domain: string, records: DnsRecord[], serial: number): Promise<void> {
  const content = renderZone(domain, records, serial);
  const path = zoneFilePath(domain);
  const previous = await readZone(`${domain}.zone`).catch(() => null);
  await callHelper({ action: 'write_config', path, content });
  const check = await callHelper<{ valid: boolean; errors?: string }>({ action: 'check_zone', zone: domain, file: path });
  if (!check.valid) {
    if (previous === null) await callHelper({ action: 'unlink', path });
    else await callHelper({ action: 'write_config', path, content: previous });
    throw new Error(`Zone invalide: ${check.errors ?? 'erreur inconnue'}`);
  }
}

/** Numéro de série suivant (AAAAMMJJnn si la zone n'en a pas). */
export function nextSerial(zone: Zone): number {
  return zone.serial > 0 ? zone.serial + 1 : Number(new Date().toISOString().slice(0, 10).replace(/-/g, '') + '01');
}
