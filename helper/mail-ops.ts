// Exploitation du service e-mail (rôle : root) : file d'attente, journaux, sauvegardes.
import { chmodSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { exec, tryExec } from './mail-util.js';
import type { MailBackupInfo, MailLogsResult, MailQueueItem, MailQueueResult } from '../server/src/core/privileged/contract.js';

const BACKUP_DIR = '/var/backups/homeserver/mail';
const MAX_QUEUE_ITEMS = 500;
const META_FILE = 'homeserver-mail-meta.json';
/** mail-<domaine>[+<boîte>]-<date>.tar.gz : « + » n'existe ni dans un domaine ni dans une boîte. */
const BACKUP_RE = /^mail-([a-z0-9.-]+?)(?:\+([a-z0-9._-]+))?-(\d{8}T\d{6})\.tar\.gz$/;

// --- File d'attente --------------------------------------------------------------------------------

interface PostqueueEntry {
  queue_name?: string;
  queue_id?: string;
  arrival_time?: number;
  message_size?: number;
  sender?: string;
  recipients?: Array<{ address?: string; delay_reason?: string }>;
}

export async function queueList(): Promise<MailQueueResult> {
  const out = (await exec('postqueue', ['-j'], 60_000)).trim();
  const lines = out ? out.split('\n') : [];
  const items: MailQueueItem[] = [];
  for (const line of lines.slice(0, MAX_QUEUE_ITEMS)) {
    try {
      const e = JSON.parse(line) as PostqueueEntry;
      items.push({
        id: e.queue_id ?? '',
        queue: e.queue_name ?? '',
        arrivalAt: e.arrival_time ? new Date(e.arrival_time * 1000).toISOString() : null,
        sizeBytes: e.message_size ?? 0,
        sender: e.sender ?? '',
        recipients: (e.recipients ?? []).map((r) => ({ address: r.address ?? '', reason: r.delay_reason ?? null })),
      });
    } catch { /* ligne illisible : on continue */ }
  }
  return { items, total: lines.length };
}

export async function queueAction(action: 'flush' | 'retry' | 'delete' | 'hold' | 'release', id: string | undefined): Promise<void> {
  const target = id ?? 'ALL';
  switch (action) {
    case 'flush':
      await exec('postqueue', ['-f'], 60_000);
      return;
    case 'retry':
      if (id) await exec('postqueue', ['-i', id], 60_000);
      else await exec('postqueue', ['-f'], 60_000);
      return;
    case 'delete':
      await exec('postsuper', ['-d', target], 120_000);
      return;
    case 'hold':
      await exec('postsuper', ['-h', target], 120_000);
      return;
    case 'release':
      await exec('postsuper', ['-H', target], 120_000);
      return;
  }
}

// --- Journaux -----------------------------------------------------------------------------------------

const LOG_IDENTIFIERS = /\b(postfix\/[a-z0-9/_-]+|dovecot|opendkim|rspamd|node)\[?\d*\]?:/;

/**
 * Dernières lignes du courrier. Une adresse filtre aussi sur ses identifiants de message : les lignes
 * d'une même livraison ne citent pas toutes l'adresse.
 */
export async function mailLogs(query: string | undefined, limit: number): Promise<MailLogsResult> {
  const raw = (await exec('journalctl', ['-S', '-7days', '-o', 'short-iso', '--no-pager', '-n', '50000'], 60_000)).split('\n');
  const lines = raw.filter((l) => LOG_IDENTIFIERS.test(l) && (!l.includes(' node[') || l.includes('hs-mail-policy') || l.includes('limite atteinte')));
  if (!query) return { lines: lines.slice(-limit) };
  const q = query.toLowerCase();
  const ids = new Set<string>();
  for (const l of lines) {
    if (!l.toLowerCase().includes(q)) continue;
    const id = l.match(/: ([0-9A-Za-z]{8,}): /)?.[1];
    if (id) ids.add(id);
  }
  const matched = lines.filter((l) => {
    if (l.toLowerCase().includes(q)) return true;
    const id = l.match(/: ([0-9A-Za-z]{8,}): /)?.[1];
    return id !== undefined && ids.has(id);
  });
  return { lines: matched.slice(-limit) };
}

// --- Sauvegardes ---------------------------------------------------------------------------------------

function ensureBackupDir(): void {
  // Messages, hashes de mots de passe et clé DKIM : root seul
  mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  chmodSync(BACKUP_DIR, 0o700);
}

function backupStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
}

export function backupList(): { backups: MailBackupInfo[] } {
  ensureBackupDir();
  const backups: MailBackupInfo[] = [];
  for (const file of readdirSync(BACKUP_DIR)) {
    const m = file.match(BACKUP_RE);
    if (!m) continue;
    const st = statSync(`${BACKUP_DIR}/${file}`);
    backups.push({ file, domain: m[1] ?? '', local: m[2] ?? null, sizeMb: Math.ceil(st.size / 1048576), createdAt: st.mtime.toISOString() });
  }
  return { backups: backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

/** Archive de la boîte ou du domaine, avec sa configuration pour une restauration complète. */
export async function backupCreate(vmailDir: string, domain: string, local: string | null, meta: unknown): Promise<MailBackupInfo> {
  ensureBackupDir();
  const file = `mail-${domain}${local ? `+${local}` : ''}-${backupStamp()}.tar.gz`;
  const target = `${BACKUP_DIR}/${file}`;
  const metaPath = `${BACKUP_DIR}/${META_FILE}`;
  writeFileSync(metaPath, JSON.stringify(meta), { mode: 0o600 });
  const member = local ? `${domain}/${local}` : domain;
  const hasData = statSync(`${vmailDir}/${member}`, { throwIfNoEntry: false }) !== undefined;
  try {
    await exec('tar', ['-czf', target, ...(hasData ? ['-C', vmailDir, member] : []), '-C', BACKUP_DIR, META_FILE], 1_800_000);
  } finally {
    rmSync(metaPath, { force: true });
  }
  chmodSync(target, 0o600);
  const st = statSync(target);
  return { file, domain, local, sizeMb: Math.ceil(st.size / 1048576), createdAt: st.mtime.toISOString() };
}

export function backupDelete(file: string): void {
  if (!BACKUP_RE.test(file)) throw new Error('Nom de sauvegarde invalide');
  rmSync(`${BACKUP_DIR}/${file}`);
}

/**
 * Contrôle l'archive avant de l'ouvrir (exécuté en root) : chaque entrée doit rester dans le domaine,
 * et le seul lien symbolique accepté est celui du répondeur.
 */
async function assertSafeArchive(path: string, root: string): Promise<void> {
  const listing = (await exec('tar', ['-tvzf', path], 600_000)).split('\n').filter(Boolean);
  for (const line of listing) {
    const type = line[0];
    const name = line.split(/\s+/).slice(5).join(' ');
    const entry = name.split(' -> ')[0] ?? '';
    if (entry === META_FILE) continue;
    if (entry.startsWith('/') || entry.split('/').includes('..') || !(entry === root || entry.startsWith(`${root}/`))) {
      throw new Error(`Archive refusée : entrée inattendue (${entry.slice(0, 80)})`);
    }
    if (type === 'l' && !entry.endsWith('/.dovecot.sieve')) throw new Error(`Archive refusée : lien symbolique inattendu (${entry.slice(0, 80)})`);
    if (type === 'l' && !name.endsWith(' -> sieve/homeserver.sieve')) throw new Error('Archive refusée : cible de lien inattendue');
    if (type !== '-' && type !== 'd' && type !== 'l') throw new Error(`Archive refusée : type d'entrée interdit (${entry.slice(0, 80)})`);
  }
}

export async function backupRead<T>(file: string): Promise<{ path: string; meta: T; domain: string; local: string | null }> {
  const m = file.match(BACKUP_RE);
  if (!m) throw new Error('Nom de sauvegarde invalide');
  const path = `${BACKUP_DIR}/${file}`;
  if (!statSync(path, { throwIfNoEntry: false })) throw new Error('Sauvegarde introuvable');
  const domain = m[1] ?? '';
  const local = m[2] ?? null;
  await assertSafeArchive(path, local ? `${domain}/${local}` : domain);
  const raw = await exec('tar', ['-xzOf', path, META_FILE], 120_000);
  return { path, meta: JSON.parse(raw) as T, domain, local };
}

/** Fusionne dans le Maildir existant (noms de messages uniques), sans propriétaire de l'archive. */
export async function backupExtract(path: string, vmailDir: string, member: string, uid: number, gid: number): Promise<void> {
  await exec('tar', ['-xzf', path, '-C', vmailDir, '--no-same-owner', '--no-same-permissions', '--exclude', META_FILE], 1_800_000);
  await exec('chown', ['-R', `${uid}:${gid}`, `${vmailDir}/${member}`], 600_000).catch(() => undefined);
  await exec('chmod', ['-R', 'u+rwX,go-rwx', `${vmailDir}/${member}`], 600_000).catch(() => undefined);
  await tryExec('restorecon', ['-R', `${vmailDir}/${member}`], 600_000);
}
