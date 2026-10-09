import { parentPort } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { DirEntryInfo, ServiceStatusResult } from '../../core/privileged/contract.js';
import { platform } from '../../core/platform/index.js';

const BIND_UNIT = platform.serviceName('bind9') as 'bind9' | 'named';

const ZONES_DIR = existsSync('/etc/bind/zones') ? '/etc/bind/zones' : '/etc/named';
const ZONE_FILE_RE = /^[A-Za-z0-9._-]+\.zone$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR'] as const;
type RecordType = (typeof RECORD_TYPES)[number];

interface DnsRecord {
  name: string;
  type: RecordType;
  value: string;
  ttl: number;
}

interface Zone {
  id: string;
  domain: string;
  file: string;
  serial: number;
  records: DnsRecord[];
}

function zoneFilePath(domain: string): string {
  return `${ZONES_DIR}/${domain}.zone`;
}

function detectPublicIp(): string {
  const interfaces = os.networkInterfaces();
  const excluded = /^((172\.(1[6-9]|2\d|3[01]))\.|192\.168\.|10\.|127\.|169\.254\.)/;
  for (const addrs of Object.values(interfaces)) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (excluded.test(a.address)) continue;
      if (a.address.startsWith('172.')) continue;
      return a.address;
    }
  }
  for (const addrs of Object.values(interfaces)) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      return a.address;
    }
  }
  return '127.0.0.1';
}

function escapeZoneValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

function parseZone(file: string, content: string): Zone {
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
      value: type === 'TXT' ? (m[4] ?? '').trim().replace(/^"|"$/g, '').replace(/\\"/g, '"') : (m[4] ?? '').trim(),
    });
  }
  return { id, domain: id, file, serial, records };
}

function renderZone(domain: string, records: DnsRecord[], serial: number): string {
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
    const value = r.type === 'TXT' && !r.value.startsWith('"') ? `"${escapeZoneValue(r.value)}"` : r.value;
    lines.push(`${name} ${r.ttl} IN ${r.type} ${value}`);
  }
  return lines.join('\n') + '\n';
}

async function listZoneFiles(): Promise<string[]> {
  const res = await callHelper<{ entries: DirEntryInfo[] }>({ action: 'list_dir', path: ZONES_DIR });
  return (res.entries ?? []).filter((e) => e.type === 'file' && ZONE_FILE_RE.test(e.name)).map((e) => e.name);
}

async function readZone(file: string): Promise<string> {
  const res = await callHelper<{ content: string }>({ action: 'read_file', path: `${ZONES_DIR}/${file}` });
  return res.content;
}

function validateRecordInput(p: Record<string, unknown>): DnsRecord {
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (name.length === 0 || name.length > 253 || /[\/\\]/.test(name)) throw new Error('Nom d\'enregistrement invalide');
  const type = typeof p.type === 'string' ? p.type.toUpperCase() : '';
  if (!RECORD_TYPES.includes(type as RecordType)) throw new Error(`Type invalide (autorisés: ${RECORD_TYPES.join(', ')})`);
  const value = typeof p.value === 'string' ? p.value.trim() : '';
  if (value.length === 0 || value.length > 2000) throw new Error('Valeur requise');
  const ttl = typeof p.ttl === 'number' && p.ttl >= 60 && p.ttl <= 604800 ? Math.floor(p.ttl) : 3600;
  return { name, type: type as RecordType, value, ttl };
}

async function loadZone(id: string): Promise<Zone> {
  const file = id.endsWith('.zone') ? id : `${id}.zone`;
  if (!ZONE_FILE_RE.test(file)) throw new Error('Identifiant de zone invalide');
  const content = await readZone(file);
  return parseZone(file, content);
}

async function writeZoneChecked(domain: string, records: DnsRecord[], serial: number): Promise<void> {
  const content = renderZone(domain, records, serial);
  const path = zoneFilePath(domain);
  await callHelper({ action: 'write_config', path, content });
  const check = await callHelper<{ valid: boolean; errors?: string }>({ action: 'check_zone', zone: domain, file: path });
  if (!check.valid) {
    await callHelper({ action: 'unlink', path });
    throw new Error(`Zone invalide: ${check.errors ?? 'erreur inconnue'}`);
  }
}

interface DnsSlave {
  name: string;
  ip: string;
  external: boolean;
}

const SLAVES_PATH = process.env.HS_DATA_DIR
  ? path.join(process.env.HS_DATA_DIR, 'dns-slaves.json')
  : '/var/lib/homeserver/dns-slaves.json';

function loadSlaves(): DnsSlave[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(SLAVES_PATH, 'utf8')) as { slaves?: DnsSlave[] };
    return Array.isArray(parsed.slaves) ? parsed.slaves : [];
  } catch {
    return [];
  }
}

function persistSlaves(slaves: DnsSlave[]): void {
  fs.mkdirSync(path.dirname(SLAVES_PATH), { recursive: true });
  fs.writeFileSync(SLAVES_PATH, JSON.stringify({ slaves }));
}

const definition: ModuleDefinition = {
  name: 'bind9',
  prefix: 'bind9',
  actions: {
    'zones.list': {
      summary: 'Lister les zones DNS',
      handler: async () => {
        const files = await listZoneFiles();
        const zones = await Promise.all(files.map(async (f) => parseZone(f, await readZone(f))));
        return zones.map(({ records, ...z }) => {
          const nsRecords = records.filter((r) => r.type === 'NS');
          const aByRecord = new Map(records.filter((r) => r.type === 'A').map((r) => [r.name, r.value]));
          const ips = new Set(
            nsRecords
              .map((r) => {
                const short = r.value.replace(/\.$/, '').replace(new RegExp(`\\.${z.domain.replace(/\./g, '\\.')}$`), '');
                return aByRecord.get(short) ?? null;
              })
              .filter((ip): ip is string => ip !== null && !['127.0.0.1', '::1'].includes(ip)),
          );
          return {
            ...z,
            recordCount: records.length,
            nsCount: nsRecords.length,
            redundantNs: ips.size >= 2,
          };
        });
      },
    },
    'zones.get': {
      summary: 'Détail d\'une zone avec ses enregistrements (payload: { id })',
      handler: (payload) => {
        const { id } = (payload ?? {}) as { id?: unknown };
        if (typeof id !== 'string') throw new Error('id requis');
        return loadZone(id);
      },
    },
    'zones.create': {
      summary: 'Créer une zone (payload: { domain, records? })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const domain = typeof p.domain === 'string' ? p.domain.trim().toLowerCase() : '';
        if (!DOMAIN_RE.test(domain)) throw new Error('Domaine invalide');
        const existing = await listZoneFiles();
        if (existing.includes(`${domain}.zone`)) throw new Error(`La zone ${domain} existe déjà`);
        const serverIp = detectPublicIp();
        const defaults: DnsRecord[] = [
          { name: '@', type: 'NS', value: `ns1.${domain}.`, ttl: 3600 },
          { name: 'ns1', type: 'A', value: serverIp, ttl: 3600 },
        ];
        const records = [
          ...defaults,
          ...(Array.isArray(p.records)
            ? p.records.map((r) => validateRecordInput(r as Record<string, unknown>))
            : []),
        ];
        const serial = Number(new Date().toISOString().slice(0, 10).replace(/-/g, '') + '01');
        await writeZoneChecked(domain, records, serial);
        await callHelper({ action: 'dns_slaves_config', slaves: loadSlaves() });
        return { id: domain, created: true };
      },
    },
    'records.add': {
      summary: 'Ajouter un enregistrement à une zone (payload: { zone, name, type, value, ttl? })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const zoneId = typeof p.zone === 'string' ? p.zone : '';
        if (!zoneId) throw new Error('zone requis');
        const zone = await loadZone(zoneId);
        const record = validateRecordInput(p);
        zone.records.push(record);
        const serial = zone.serial > 0 ? zone.serial + 1 : Number(new Date().toISOString().slice(0, 10).replace(/-/g, '') + '01');
        await writeZoneChecked(zone.domain, zone.records, serial);
        await callHelper({ action: 'systemctl', unit: BIND_UNIT, verb: 'reload' });
        return { zone: zone.id, record, added: true };
      },
    },
    'records.delete': {
      summary: 'Supprimer un enregistrement (payload: { zone, name, type, value })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const zoneId = typeof p.zone === 'string' ? p.zone : '';
        if (!zoneId) throw new Error('zone requis');
        const zone = await loadZone(zoneId);
        const name = typeof p.name === 'string' ? p.name : null;
        const type = typeof p.type === 'string' ? p.type.toUpperCase() : null;
        const value = typeof p.value === 'string' ? p.value : null;
        if (name === null || type === null || value === null) throw new Error('name, type et value requis');
        const idx = zone.records.findIndex((r) => r.name === name && r.type === type && r.value === value);
        if (idx < 0) throw new Error('Enregistrement introuvable');
        zone.records.splice(idx, 1);
        const serial = zone.serial > 0 ? zone.serial + 1 : Number(new Date().toISOString().slice(0, 10).replace(/-/g, '') + '01');
        await writeZoneChecked(zone.domain, zone.records, serial);
        await callHelper({ action: 'systemctl', unit: BIND_UNIT, verb: 'reload' });
        return { zone: zone.id, deleted: true };
      },
    },
    'zones.delete': {
      summary: 'Supprimer une zone (payload: { id })',
      handler: async (payload) => {
        const { id } = (payload ?? {}) as { id?: unknown };
        if (typeof id !== 'string') throw new Error('id requis');
        const file = id.endsWith('.zone') ? id : `${id}.zone`;
        if (!ZONE_FILE_RE.test(file)) throw new Error('Identifiant de zone invalide');
        await callHelper({ action: 'unlink', path: `${ZONES_DIR}/${file}` });
        await callHelper({ action: 'dns_slaves_config', slaves: loadSlaves() });
        return { id, deleted: true };
      },
    },
    'slaves.config': {
      summary: 'Déclarer les esclaves DNS : allow-transfer + also-notify dans Bind (payload: { slaves: [{ name, ip, external }] })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const raw = Array.isArray(p.slaves) ? p.slaves : [];
        const slaves = raw.map((s) => {
          const so = (s ?? {}) as Record<string, unknown>;
          return { name: String(so.name ?? ''), ip: String(so.ip ?? ''), external: so.external === true };
        });
        return callHelper({ action: 'dns_slaves_config', slaves });
      },
    },
    'slaves.list': {
      summary: 'Lister les esclaves DNS déclarés',
      handler: () => ({ slaves: loadSlaves() }),
    },
    'slaves.set': {
      summary: 'Déclarer les esclaves DNS et appliquer allow-transfer/also-notify (payload: { slaves: [{ name, ip, external }] })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const raw = Array.isArray(p.slaves) ? p.slaves : [];
        const slaves = raw.map((s) => {
          const so = (s ?? {}) as Record<string, unknown>;
          return { name: String(so.name ?? ''), ip: String(so.ip ?? ''), external: so.external === true };
        }).filter((s) => s.name && s.ip);
        if (slaves.length === 0) throw new Error('Au moins un esclave requis (nom + IP)');
        const res = await callHelper({ action: 'dns_slaves_config', slaves });
        persistSlaves(slaves);
        return res;
      },
    },
    'slaves.delete': {
      summary: 'Réappliquer une liste d\'esclaves vide (payload: { })',
      handler: async () => {
        const res = await callHelper({ action: 'dns_slaves_config', slaves: [] });
        persistSlaves([]);
        return res;
      },
    },
    'zones.health': {
      summary: 'Santé DNS d\'une zone : NS, redondance des IP, synchro serial avec les esclaves (payload: { id, slaves: [{ name, ip }] })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const id = typeof p.id === 'string' ? p.id : '';
        if (!id) throw new Error('id requis');
        const zone = await loadZone(id);
        const nsRecords = zone.records.filter((r) => r.type === 'NS').map((r) => r.value.replace(/\.$/, ''));
        const aByRecord = new Map(zone.records.filter((r) => r.type === 'A').map((r) => [r.name, r.value]));
        const nsIps: Array<{ ns: string; ip: string | null; external: boolean }> = nsRecords.map((ns) => {
          const shortName = ns.replace(new RegExp(`\\.${zone.domain.replace(/\./g, '\\.')}$`), '');
          const ip = aByRecord.get(shortName) ?? null;
          return { ns, ip, external: ip !== null && !['127.0.0.1', '::1'].includes(ip) };
        });
        const ips = nsIps.filter((n) => n.ip !== null).map((n) => n.ip as string);
        const uniqueIps = new Set(ips);
        const redundant = uniqueIps.size >= 2;
        const rawSlaves = Array.isArray(p.slaves) ? p.slaves : loadSlaves();
        const slaves = [] as Array<{ name: string; ip: string; synced: boolean | null; serial: number | null }>;
        for (const s of rawSlaves) {
          const so = (s ?? {}) as Record<string, unknown>;
          const name = String(so.name ?? '');
          const ip = String(so.ip ?? '');
          if (!name || !ip) continue;
          try {
            const res = await callHelper<{ serial: number }>({ action: 'dns_soa_query', server: ip, zone: zone.domain });
            slaves.push({ name, ip, synced: res.serial === zone.serial, serial: res.serial });
          } catch {
            slaves.push({ name, ip, synced: null, serial: null });
          }
        }
        return {
          zone: zone.id,
          serial: zone.serial,
          ns: nsIps,
          redundant,
          delegable: nsIps.length >= 2 && redundant,
          slaves,
        };
      },
    },
    'service.status': {
      summary: 'État du service DNS (systemctl)',
      handler: () => callHelper<ServiceStatusResult>({ action: 'systemctl', unit: BIND_UNIT, verb: 'status' }),
    },
    'service.reload': {
      summary: 'Recharger la configuration DNS',
      handler: async () => {
        await callHelper({ action: 'systemctl', unit: BIND_UNIT, verb: 'reload' });
        return { reloaded: true };
      },
    },
  },
};

if (!parentPort) throw new Error('bind9 worker must run in a worker thread');
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
