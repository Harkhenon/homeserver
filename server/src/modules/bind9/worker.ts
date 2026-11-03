import { parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import type { ServiceStatusResult } from '../../core/privileged/contract.js';
import {
  BIND_UNIT, RECORD_TYPES, ZONES_DIR, ZONE_FILE_RE, listZoneFiles, loadZone, parseZone, readZone, writeZoneChecked,
  type DnsRecord, type RecordType, type Zone,
} from './zonefile.js';

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
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

const EXTERNAL_DOMAINS_PATH = process.env.HS_DATA_DIR
  ? path.join(process.env.HS_DATA_DIR, 'external-domains.json')
  : '/var/lib/homeserver/external-domains.json';

interface ExternalDomain {
  id: string;
  domain: string;
  registrar: string | null;
}

function loadExternalDomains(): ExternalDomain[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(EXTERNAL_DOMAINS_PATH, 'utf8')) as { domains?: ExternalDomain[] };
    return Array.isArray(parsed.domains) ? parsed.domains : [];
  } catch {
    return [];
  }
}

function persistExternalDomains(domains: ExternalDomain[]): void {
  fs.mkdirSync(path.dirname(EXTERNAL_DOMAINS_PATH), { recursive: true });
  fs.writeFileSync(EXTERNAL_DOMAINS_PATH, JSON.stringify({ domains }));
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
        const local = zones.map(({ records, ...z }) => {
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
            external: false,
            registrar: null,
            recordCount: records.length,
            nsCount: nsRecords.length,
            redundantNs: ips.size >= 2,
          };
        });
        const external = loadExternalDomains().map((d) => ({
          id: d.id,
          domain: d.domain,
          file: '',
          serial: 0,
          external: true,
          registrar: d.registrar,
          recordCount: 0,
          nsCount: 0,
          redundantNs: false,
        }));
        return [...local, ...external];
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
    'external.create': {
      summary: 'D\u00e9clarer un domaine g\u00e9r\u00e9 par le registrar, sans zone Bind (payload: { domain, registrar? })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        const domain = typeof p.domain === 'string' ? p.domain.trim().toLowerCase() : '';
        if (!DOMAIN_RE.test(domain)) throw new Error('Domaine invalide');
        const registrar = typeof p.registrar === 'string' && p.registrar.trim().length > 0
          ? p.registrar.trim()
          : null;
        const domains = loadExternalDomains();
        if (domains.some((d) => d.domain === domain)) throw new Error(`Le domaine ${domain} est d\u00e9j\u00e0 d\u00e9clar\u00e9`);
        const existingZones = await listZoneFiles();
        if (existingZones.includes(`${domain}.zone`)) {
          throw new Error(`Une zone Bind9 existe d\u00e9j\u00e0 pour ${domain}`);
        }
        domains.push({ id: domain, domain, registrar });
        persistExternalDomains(domains);
        return { id: domain, external: true, registrar };
      },
    },
    'external.delete': {
      summary: 'Retirer un domaine externe (payload: { id })',
      handler: (payload) => {
        const { id } = (payload ?? {}) as { id?: unknown };
        if (typeof id !== 'string' || id.length === 0) throw new Error('id requis');
        const domains = loadExternalDomains();
        const next = domains.filter((d) => d.id !== id);
        if (next.length === domains.length) throw new Error('Domaine externe introuvable');
        persistExternalDomains(next);
        return { id, deleted: true };
      },
    },
    'external.list': {
      summary: 'Lister les domaines g\u00e9r\u00e9s par le registrar',
      handler: () => ({ domains: loadExternalDomains() }),
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
