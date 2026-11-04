import { createServer, BlockList, isIP } from 'node:net';
import {
  mkdirSync, existsSync, statSync, lstatSync, unlinkSync, readdirSync, readFileSync, writeFileSync, symlinkSync, rmSync,
  chownSync, lchownSync, chmodSync, rmdirSync, openSync, closeSync, fstatSync, ftruncateSync, fchmodSync, fchownSync, readlinkSync, renameSync, constants,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { networkInterfaces, userInfo } from 'node:os';

function uidOf(user: string): number | undefined {
  const passwd = readFileSync('/etc/passwd', 'utf8');
  for (const line of passwd.split('\n')) {
    const [name, , uid] = line.split(':');
    if (name === user) return Number(uid);
  }
  return undefined;
}
function gidOf(user: string): number | undefined {
  const passwd = readFileSync('/etc/passwd', 'utf8');
  for (const line of passwd.split('\n')) {
    const [name, , , gid] = line.split(':');
    if (name === user) return Number(gid);
  }
  return undefined;
}
function homeOf(user: string): string | undefined {
  const passwd = readFileSync('/etc/passwd', 'utf8');
  for (const line of passwd.split('\n')) {
    const [name, , , , , home] = line.split(':');
    if (name === user) return home;
  }
  return undefined;
}
import { execFileSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateRequest, validateFail2banConfig, CONTRACT_VERSION, FAIL2BAN_JAILS } from '../server/src/core/privileged/contract.js';
import { handleMail, upgradeMailOnStart, type MailDeps } from './mail.js';
import type { MailRequest, SshHardeningStatusResult,SshHardeningApplyResult, Fail2banStatusResult, Fail2banConfig, Fail2banConfigResult, Fail2banJailName } from '../server/src/core/privileged/contract.js';

const SOCKET_PATH = process.env.HS_HELPER_SOCKET ?? '/run/homeserver/helper.sock';
// Layout (scripts/layout.sh) : tout ce que root lit pour décider ou exécute vit dans des
// répertoires root ; le HOME de hs-* (/var/lib/homeserver) n'est jamais lu ni écrit ici.
const INSTALL_DIR = process.env.HS_INSTALL_DIR ?? '/usr/share/homeserver';
const OPT_DIR = '/opt/homeserver';
const RELEASES_DIR = `${OPT_DIR}/releases`;
const INSTALLED_FILE = `${RELEASES_DIR}/installed.json`;
const STATUS_FILE = `${OPT_DIR}/update-status.json`;
const CURRENT_LINK = `${INSTALL_DIR}/current`;
const NODE_BIN = `${OPT_DIR}/node/bin/node`;
const VERSION_RE = /^[0-9][0-9A-Za-z.-]{0,31}$/;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_CONNECTIONS = 32;

/** .env du panel : appartient à hs-*, dans un répertoire root (il ne peut pas le remplacer par un lien). */
function findPanelEnv(): string | null {
  const p = `${INSTALL_DIR}/.env`;
  const st = lstatSync(p, { throwIfNoEntry: false });
  return st?.isFile() ? p : null;
}

function readPanelEnv(file: string): string {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return readFileSync(fd, 'utf8'); } finally { closeSync(fd); }
}

/** Réécriture en place (propriétaire et droits conservés, jamais à travers un lien). */
function writePanelEnv(file: string, content: string): void {
  const fd = openSync(file, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW);
  try {
    writeFileSync(fd, content);
    fchmodSync(fd, 0o600);
  } finally { closeSync(fd); }
}

function readJsonState(file: string, errMsg: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new Error(errMsg);
  }
}

function writeJsonState(file: string, data: Record<string, unknown>): void {
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o644 });
  renameSync(`${file}.tmp`, file);
}

/** Bascule atomique du lien current (lien temporaire puis renommage). */
function switchCurrent(version: string): void {
  const tmp = `${CURRENT_LINK}.new`;
  rmSync(tmp, { force: true });
  symlinkSync(`${RELEASES_DIR}/${version}`, tmp);
  renameSync(tmp, CURRENT_LINK);
}
const LOG_FILE = process.env.HS_HELPER_LOG ?? '/var/log/homeserver/helper.log';

/**
 * Node pour les apps des utilisateurs : le runtime root de /opt/homeserver (jamais un
 * binaire modifiable par hs-*). Les liens /usr/local/bin sont posés par layout.sh.
 */
function nodeBinary(): string {
  return existsSync(NODE_BIN) ? NODE_BIN : '/usr/bin/env node';
}

// --- Comptes gérés par le panel ---------------------------------------------------
// Les actions sur les comptes (mot de passe, clés SSH, suppression, apps Node) ne visent
// que les utilisateurs créés par le panel : jamais root, un compte système, hs-* ou un
// administrateur existant (sinon : mot de passe root, clé SSH d'un sudoer…).
const PANEL_GROUPS = ['homeserver-web', 'homeserver-sftp'];

function groupMembers(group: string): string[] {
  for (const line of readFileSync('/etc/group', 'utf8').split('\n')) {
    const [name, , , members] = line.split(':');
    if (name === group) return (members ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  }
  return [];
}

function isPanelUser(user: string): boolean {
  if (user === 'root' || user.startsWith('hs-')) return false;
  const uid = uidOf(user);
  if (uid === undefined || uid < 1000 || uid === 65534) return false;
  return PANEL_GROUPS.some((g) => groupMembers(g).includes(user));
}

function assertPanelUser(user: string): void {
  if (!isPanelUser(user)) throw new Error(`${user} n'est pas un utilisateur géré par le panel`);
}

/**
 * Exécute un petit script Node sous l'identité d'un utilisateur : les liens symboliques
 * qu'il a pu poser dans son HOME ne mènent alors qu'à ce qu'il peut déjà modifier.
 */
function runAsUser(user: string, script: string, input: string, timeoutMs = 60_000): string {
  const uid = uidOf(user);
  const gid = gidOf(user);
  if (uid === undefined || gid === undefined || uid === 0) throw new Error(`Utilisateur ${user} introuvable`);
  const res = spawnSync(process.execPath, ['-e', script], {
    uid, gid, input, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: homeOf(user) ?? '/', LANG: 'C.UTF-8' }, cwd: '/',
  });
  if (res.status !== 0) throw new Error((res.stderr || res.error?.message || 'échec').trim().split('\n').pop() ?? 'échec');
  return res.stdout;
}

/**
 * chpasswd lit le mot de passe sur un vrai pipe (cat | chpasswd) : libuv passe stdin par un
 * socketpair que SELinux (Fedora/RHEL) interdit au domaine passwd_t — chpasswd recevait
 * alors /dev/null et échouait (EPIPE). Le mot de passe ne passe jamais en argument.
 */
function setUnixPassword(user: string, password: string): void {
  execFileSync('/bin/sh', ['-c', 'cat | chpasswd'], { input: `${user}:${password}\n`, stdio: ['pipe', 'ignore', 'pipe'], timeout: 30_000 });
}

/** ~/.ssh créé par root dans un HOME root (chroot SFTP) ; jamais à travers un lien. */
function ensureSshDir(user: string): void {
  const home = homeOf(user);
  if (!home || !lstatSync(home, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Répertoire personnel introuvable: ${home}`);
  const sshDir = `${home}/.ssh`;
  const st = lstatSync(sshDir, { throwIfNoEntry: false });
  if (st && !st.isDirectory()) throw new Error(`${sshDir} n'est pas un répertoire`);
  if (!st) mkdirSync(sshDir, { mode: 0o700 });
  const uid = uidOf(user);
  const gid = gidOf(user);
  if (uid !== undefined && gid !== undefined) lchownSync(sshDir, uid, gid);
}

// authorized_keys lu et écrit sous l'identité de l'utilisateur (runAsUser)
const SSH_KEYS_SCRIPT = `
const fs = require('fs');
const req = JSON.parse(fs.readFileSync(0, 'utf8'));
const file = require('os').homedir() + '/.ssh/authorized_keys';
const read = () => { try { return fs.readFileSync(file, 'utf8').split('\\n').map((l) => l.trim()).filter(Boolean); } catch { return []; } };
const keys = read();
if (req.op === 'list') {
  console.log(JSON.stringify({ keys: keys.filter((l) => !l.startsWith('#')) }));
} else if (req.op === 'add') {
  if (keys.includes(req.key)) { console.error('Cette clé est déjà installée'); process.exit(1); }
  keys.push(req.key);
  fs.writeFileSync(file, keys.join('\\n') + '\\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  console.log(JSON.stringify({ count: keys.length }));
} else if (req.op === 'remove') {
  if (keys.length === 0) { console.error('Aucune clé installée'); process.exit(1); }
  if (req.index >= keys.length) { console.error('Clé introuvable'); process.exit(1); }
  keys.splice(req.index, 1);
  if (keys.length === 0) fs.rmSync(file);
  else fs.writeFileSync(file, keys.join('\\n') + '\\n', { mode: 0o600 });
  console.log(JSON.stringify({ count: keys.length }));
}
`;

const run = promisify(execFile);

// --- Bind : emplacements selon la famille ---------------------------------------------------------

function bindZonesDir(): string {
  // Debian/Ubuntu : AppArmor interdit à named de lire hors de /etc/bind
  if (!existsSync('/etc/bind')) return '/etc/named';
  mkdirSync('/etc/bind/zones', { recursive: true, mode: 0o755 });
  return '/etc/bind/zones';
}

/** RHEL/Fedora : /etc/named.conf n'inclut pas nos zones et n'écoute que sur localhost. */
function ensureRhelNamedConf(includeFile: string): void {
  const conf = '/etc/named.conf';
  if (!existsSync(conf)) return;
  const current = readFileSync(conf, 'utf8');
  let next = current
    .replace(/listen-on port 53 \{ 127\.0\.0\.1; \};/, 'listen-on port 53 { any; };')
    .replace(/listen-on-v6 port 53 \{ ::1; \};/, 'listen-on-v6 port 53 { any; };');
  if (!next.includes(includeFile)) next = `${next.trimEnd()}\ninclude "${includeFile}";\n`;
  if (next !== current) writeFileSync(conf, next, { mode: statSync(conf).mode & 0o777 });
}

/** Anciennes versions : zones écrites dans /etc/named sur Debian/Ubuntu, jamais servies par Bind. */
function migrateBindZones(): void {
  if (!existsSync('/etc/bind') || !existsSync('/etc/named')) return;
  try {
    const zones = readdirSync('/etc/named').filter((f) => f.endsWith('.zone'));
    if (zones.length === 0) return;
    const dir = bindZonesDir();
    for (const z of zones) if (!existsSync(`${dir}/${z}`)) renameSync(`/etc/named/${z}`, `${dir}/${z}`);
    const include = '/etc/bind/homeserver-zones.conf';
    if (existsSync(include)) {
      writeFileSync(include, readFileSync(include, 'utf8').replaceAll('"/etc/named/', '"/etc/bind/zones/'), { mode: 0o644 });
      execFile('systemctl', ['reload', 'bind9'], () => undefined);
    }
    log(`bind : ${zones.length} zone(s) déplacée(s) de /etc/named vers ${dir}`);
  } catch (e) {
    log(`bind : migration des zones impossible : ${(e as Error).message}`);
  }
}

function log(line: string): void {
  mkdirSync(LOG_FILE.replace(/\/[^/]+$/, ''), { recursive: true });
  import('node:fs').then((fs) => fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`));
}

async function exec(cmd: string, args: string[], timeoutMs = 120_000): Promise<string> {
  const { stdout } = await run(cmd, args, { timeout: timeoutMs });
  return stdout;
}

async function tryExec(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, args, { timeout: 120_000 });
    return stdout;
  } catch {
    return null;
  }
}

function detectFamily(): 'debian' | 'rhel' {
  try {
    const os = readFileSync('/etc/os-release', 'utf8');
    const id = os.match(/^ID="?([^"\n]+)"?/m)?.[1] ?? '';
    const like = os.match(/^ID_LIKE="?([^"\n]+)"?/m)?.[1] ?? '';
    if (/debian|ubuntu/.test(`${id} ${like}`)) return 'debian';
    return 'rhel';
  } catch {
    return 'rhel';
  }
}

// --- Gestionnaire de paquets ----------------------------------------------------
// apt/dnf lancés depuis un service sans terminal : jamais de question debconf/needrestart,
// attente du verrou dpkg (cloud-init, unattended-upgrades) au lieu d'échouer, timeout
// large (un apt tué en plein dpkg laisse le système à réparer) et sortie non tronquée.
const PKG_ENV = { ...process.env, DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a', NEEDRESTART_SUSPEND: '1' };
const APT_OPTS = ['-o', 'DPkg::Lock::Timeout=600', '-o', 'Dpkg::Options::=--force-confdef', '-o', 'Dpkg::Options::=--force-confold'];
const PKG_TIMEOUT = 1_800_000;
const PKG_MAX_BUFFER = 64 * 1024 * 1024;

async function pkgRun(cmd: 'apt-get' | 'dnf', args: string[], timeoutMs = PKG_TIMEOUT): Promise<string> {
  try {
    const { stdout } = await run(cmd, cmd === 'apt-get' ? [...APT_OPTS, ...args] : args, { timeout: timeoutMs, env: PKG_ENV, maxBuffer: PKG_MAX_BUFFER });
    return stdout;
  } catch (e) {
    const err = e as Error & { stderr?: string; killed?: boolean };
    const tail = (err.stderr ?? '').trim().split('\n').slice(-5).join(' | ');
    throw new Error(`${cmd} ${args.join(' ')} : ${err.killed ? 'timeout' : tail || err.message}`);
  }
}

const apt = (args: string[], timeoutMs?: number) => pkgRun('apt-get', args, timeoutMs);
const dnf = (args: string[], timeoutMs?: number) => pkgRun('dnf', args, timeoutMs);

async function pkgInstall(family: 'debian' | 'rhel', packages: string[]): Promise<void> {
  if (family === 'debian') await apt(['install', '-y', ...packages]);
  else await dnf(['install', '-y', ...packages]);
}

function osRelease(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync('/etc/os-release', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=["']?(.*?)["']?$/);
      if (m?.[1] !== undefined) out[m[1]] = m[2] ?? '';
    }
  } catch { /* distribution inconnue */ }
  return out;
}

/** apt-cache policy : "Candidate: (none)" veut dire indisponible. */
function hasCandidate(policy: string): boolean {
  const m = policy.match(/Candidate:\s*(\S+)/);
  return !!m && m[1] !== '(none)';
}

let aptUpdatedAt = 0;
async function aptUpdate(force = false): Promise<void> {
  if (!force && Date.now() - aptUpdatedAt < 10 * 60_000) return;
  await apt(['update'], 600_000);
  aptUpdatedAt = Date.now();
}

// Dépôt PHP multi-versions : Sury (Debian) / PPA ondrej (Ubuntu) / Remi (RHEL-like).
// Un dépôt qui ne supporte pas la version de la distribution casserait tous les
// apt-get update suivants : il est retiré aussitôt si la mise à jour échoue.
async function ensureSuryRepo(family: 'debian' | 'rhel'): Promise<void> {
  if (family === 'debian') {
    await aptUpdate();
    if (hasCandidate(await exec('apt-cache', ['policy', 'php8.4-fpm']).catch(() => ''))) return;
    const os = osRelease();
    const codename = os.VERSION_CODENAME || os.UBUNTU_CODENAME || '';
    if (!codename) return;
    if (os.ID === 'ubuntu') {
      if (!existsSync('/usr/bin/add-apt-repository')) await apt(['install', '-y', 'software-properties-common']);
      try {
        await exec('add-apt-repository', ['-y', '--no-update', 'ppa:ondrej/php'], 120_000);
        await aptUpdate(true);
      } catch (e) {
        await tryExec('add-apt-repository', ['-y', '--remove', 'ppa:ondrej/php']);
        await aptUpdate(true).catch(() => {});
        log(`PPA ondrej/php indisponible pour ${codename} : ${(e as Error).message}`);
      }
      return;
    }
    const list = '/etc/apt/sources.list.d/php.list';
    const key = '/usr/share/keyrings/deb.sury.org-php.gpg';
    if (existsSync(list)) return;
    await apt(['install', '-y', '--no-install-recommends', 'ca-certificates', 'curl', 'gnupg']);
    await exec('bash', ['-c', `curl -fsSL --retry 3 https://packages.sury.org/php/apt.gpg | gpg --batch --yes --dearmor -o ${key}`]);
    writeFileSync(list, `deb [signed-by=${key}] https://packages.sury.org/php/ ${codename} main\n`, { mode: 0o644 });
    try {
      await aptUpdate(true);
    } catch (e) {
      rmSync(list, { force: true });
      rmSync(key, { force: true });
      await aptUpdate(true).catch(() => {});
      log(`dépôt Sury indisponible pour ${codename} : ${(e as Error).message}`);
    }
  } else {
    const remi = await exec('dnf', ['repolist']).catch(() => '');
    if (remi.includes('remi')) return;
    const os = osRelease();
    const major = (os.VERSION_ID ?? '').split('.')[0] ?? '';
    if (!/^\d+$/.test(major)) return;
    if (os.ID === 'fedora') {
      await dnf(['install', '-y', `https://rpms.remirepo.net/fedora/remi-release-${major}.rpm`]);
    } else {
      await dnf(['install', '-y', 'epel-release']).catch(() => {});
      await dnf(['install', '-y', `https://rpms.remirepo.net/enterprise/remi-release-${major}.rpm`]).catch(async () => {
        await dnf(['install', '-y', 'remi-release']);
      });
    }
  }
}

async function isPackageInstalled(family: 'debian' | 'rhel', pkg: string): Promise<boolean> {
  try {
    if (family === 'debian') {
      const out = await exec('dpkg-query', ['-W', '-f=${Status}', pkg]);
      return out.includes('install ok installed');
    }
    const out = await exec('rpm', ['-q', pkg]);
    return !out.includes('not installed');
  } catch {
    return false;
  }
}

async function handleDiscoverPhp(family: 'debian' | 'rhel'): Promise<unknown> {
  const known = ['8.1', '8.2', '8.3', '8.4', '8.5'];
  let versions = known;
  if (family === 'debian') {
    // Versions réellement proposées par les dépôts (ex: 8.5 sur une distribution récente)
    const names = await exec('apt-cache', ['pkgnames', 'php']).catch(() => '');
    const found = names.split('\n').map((n) => n.match(/^php(\d\.\d)-fpm$/)?.[1]).filter((v): v is string => !!v);
    versions = [...new Set([...known, ...found])].sort((a, b) => Number(a) - Number(b));
  }
  const pkgFor = (v: string) => family === 'debian' ? `php${v}-fpm` : `php${v.replace('.', '')}-php-fpm`;
  const result = await Promise.all(versions.map(async (v) => ({
    version: v,
    package: pkgFor(v),
    installed: await isPackageInstalled(family, pkgFor(v)),
    available: family === 'rhel' ? true : await exec('apt-cache', ['policy', pkgFor(v)]).then(hasCandidate).catch(() => false),
  })));
  return { kind: 'php', versions: result };
}

function detectApacheLayout(): 'debian' | 'rhel' {
  return existsSync('/etc/apache2/sites-available') ? 'debian' : 'rhel';
}

function siteEnablePaths(site: string): { available: string; enabled: string } | null {
  const layout = detectApacheLayout();
  if (layout === 'debian') {
    return { available: `/etc/apache2/sites-available/${site}`, enabled: `/etc/apache2/sites-enabled/${site}` };
  }
  return { available: `/etc/httpd/sites-available/${site}`, enabled: `/etc/httpd/sites-enabled/${site}` };
}

// --- Fichiers des utilisateurs (fs_*) -------------------------------------------------
// Racines : /var/www/<site> et /home/<utilisateur du panel>. Le HOME d'un autre compte
// (administrateur, root…) n'est jamais lu ni écrit. Pour résister aux liens symboliques et
// aux renommages concurrents (TOCTOU), le répertoire parent est ouvert puis son chemin
// réel vérifié via /proc/self/fd ; l'opération porte ensuite sur ce descripteur, avec
// O_NOFOLLOW sur le dernier élément. Les fichiers créés appartiennent au propriétaire de la racine.
interface FsAnchor { root: string; uid: number; gid: number; user: string | null; missing?: boolean }

function fsAnchor(path: string): FsAnchor {
  const parts = path.replace(/\/+$/, '').split('/');
  const isHome = parts[1] === 'home';
  const root = isHome ? parts.slice(0, 3).join('/') : parts.slice(0, 4).join('/');
  if ((isHome && parts.length < 3) || (!isHome && parts.length < 4)) throw new Error('Chemin refusé (racine)');
  if (isHome) {
    const user = parts[2] ?? '';
    if (!isPanelUser(user) || homeOf(user) !== root) throw new Error(`Accès refusé : ${root} n'est pas le dossier d'un utilisateur du panel`);
  }
  const st = lstatSync(root, { throwIfNoEntry: false });
  if (!st) {
    // Nouveau site sous /var/www : créé par root (fs_mkdir), comme /var/www lui-même
    if (isHome) throw new Error('Cible introuvable');
    return { root, uid: 0, gid: 0, user: 'root', missing: true };
  }
  if (!st.isDirectory()) throw new Error(st.isSymbolicLink() ? 'Chemin refusé (lien symbolique)' : 'Chemin refusé : la racine doit être un répertoire');
  if (isHome) {
    // HOME root (chroot SFTP) : les fichiers créés reviennent à l'utilisateur lui-même
    const user = parts[2] ?? '';
    return { root, uid: uidOf(user) ?? 0, gid: gidOf(user) ?? 0, user };
  }
  let user: string | null = null;
  for (const line of readFileSync('/etc/passwd', 'utf8').split('\n')) {
    const f = line.split(':');
    if (Number(f[2]) === st.uid && f[0]) { user = f[0]; break; }
  }
  return { root, uid: st.uid, gid: st.gid, user };
}

/** Ouvre un répertoire et vérifie qu'aucun lien symbolique n'a été traversé. */
function openDirStrict(dir: string): number {
  const fd = openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY);
  if (readlinkSync(`/proc/self/fd/${fd}`) !== dir) {
    closeSync(fd);
    throw new Error('Chemin refusé (lien symbolique)');
  }
  return fd;
}

function splitPath(path: string): { parent: string; name: string } {
  const clean = path.replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  return { parent: clean.slice(0, idx) || '/', name: clean.slice(idx + 1) };
}

function withParent<T>(path: string, fn: (at: string, name: string) => T): T {
  const { parent, name } = splitPath(path);
  const fd = openDirStrict(parent);
  try { return fn(`/proc/self/fd/${fd}/${name}`, name); } finally { closeSync(fd); }
}

function fsReadSafe(path: string): string {
  fsAnchor(path);
  return withParent(path, (at) => {
    const fd = openSync(at, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const st = fstatSync(fd);
      if (!st.isFile()) throw new Error('Cible non supportée');
      if (st.size > 5_000_000) throw new Error('Fichier trop volumineux');
      return readFileSync(fd, 'utf8');
    } finally { closeSync(fd); }
  });
}

function fsWriteSafe(path: string, content: string): void {
  const anchor = fsAnchor(path);
  fsMkdirSafe(splitPath(path).parent, anchor);
  withParent(path, (at) => {
    const fd = openSync(at, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o644);
    try {
      const st = fstatSync(fd);
      if (!st.isFile()) throw new Error('Cible non supportée');
      ftruncateSync(fd, 0);
      writeFileSync(fd, content);
      if (st.size === 0 && st.uid === 0 && anchor.uid !== 0) fchownSync(fd, anchor.uid, anchor.gid);
    } finally { closeSync(fd); }
  });
}

function fsMkdirSafe(path: string, anchor = fsAnchor(path)): void {
  const clean = path.replace(/\/+$/, '');
  if (anchor.missing) withParent(anchor.root, (at) => mkdirSync(at, { mode: 0o755 }));
  if (clean === anchor.root) return;
  const rel = clean.slice(anchor.root.length + 1).split('/');
  let cur = anchor.root;
  for (const part of rel) {
    const next = `${cur}/${part}`;
    const fd = openDirStrict(cur);
    try {
      const at = `/proc/self/fd/${fd}/${part}`;
      const st = lstatSync(at, { throwIfNoEntry: false });
      if (!st) {
        mkdirSync(at, { mode: 0o755 });
        if (anchor.uid !== 0) lchownSync(at, anchor.uid, anchor.gid);
      } else if (!st.isDirectory()) {
        throw new Error(`Chemin refusé : ${next} n'est pas un répertoire`);
      }
    } finally { closeSync(fd); }
    cur = next;
  }
}

function fsListSafe(path: string): Array<{ name: string; type: string; sizeBytes: number; mode: string; owner: string; group: string; modifiedAt: string }> {
  const clean = path.replace(/\/+$/, '');
  if (clean === '/home' || clean === '/var/www') {
    // Racines : seuls les dossiers des utilisateurs du panel (et les sites) sont listés
    if (!existsSync(clean)) return [];
    return readdirSync(clean)
      .filter((name) => clean === '/var/www' || isPanelUser(name))
      .map((name) => fsEntry(`${clean}/${name}`, name));
  }
  fsAnchor(clean);
  const fd = openDirStrict(clean);
  try {
    return readdirSync(`/proc/self/fd/${fd}`).map((name) => fsEntry(`/proc/self/fd/${fd}/${name}`, name));
  } finally { closeSync(fd); }
}

function fsEntry(full: string, name: string): { name: string; type: string; sizeBytes: number; mode: string; owner: string; group: string; modifiedAt: string } {
  const st = lstatSync(full, { throwIfNoEntry: false });
  const type = st?.isDirectory() ? 'dir' : st?.isSymbolicLink() ? 'symlink' : st?.isFile() ? 'file' : 'other';
  return {
    name,
    type,
    sizeBytes: st?.size ?? 0,
    mode: st ? (st.mode & 0o777).toString(8).padStart(3, '0') : '',
    owner: '',
    group: '',
    modifiedAt: st ? st.mtime.toISOString() : '',
  };
}

/**
 * Parcours récursif ancré sur descripteurs : chaque répertoire est ouvert sans suivre de
 * lien (O_NOFOLLOW) et ses entrées sont traitées via /proc/self/fd — un lien ou un
 * renommage concurrent dans l'arborescence ne peut pas faire sortir de la cible.
 */
function walkTree(at: string, visit: (entry: string, isDir: boolean) => void): void {
  const st = lstatSync(at);
  if (st.isDirectory()) {
    const fd = openSync(at, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      for (const name of readdirSync(`/proc/self/fd/${fd}`)) walkTree(`/proc/self/fd/${fd}/${name}`, visit);
    } finally { closeSync(fd); }
  }
  visit(at, st.isDirectory());
}

async function fsDeleteSafe(path: string): Promise<void> {
  const anchor = fsAnchor(path);
  if (path.replace(/\/+$/, '') === anchor.root) throw new Error('Interdit de supprimer une racine');
  withParent(path, (at) => {
    if (!lstatSync(at, { throwIfNoEntry: false })) throw new Error('Cible introuvable');
    walkTree(at, (entry, isDir) => (isDir ? rmdirSync(entry) : unlinkSync(entry)));
  });
}

function gidOfGroup(group: string): number | undefined {
  for (const line of readFileSync('/etc/group', 'utf8').split('\n')) {
    const [name, , gid] = line.split(':');
    if (name === group) return Number(gid);
  }
  return undefined;
}

const WEB_ACCOUNTS = ['www-data', 'apache', 'nginx'];

async function fsChownSafe(path: string, owner: string, group: string, recursive: boolean): Promise<void> {
  fsAnchor(path);
  // Seuls les comptes du panel et ceux du serveur web peuvent recevoir des fichiers
  if (!isPanelUser(owner) && !WEB_ACCOUNTS.includes(owner)) throw new Error(`Propriétaire refusé : ${owner}`);
  const allowedGroups = new Set([...PANEL_GROUPS, ...WEB_ACCOUNTS]);
  const ownerGid = gidOf(owner);
  for (const line of readFileSync('/etc/group', 'utf8').split('\n')) {
    const [name, , gid] = line.split(':');
    if (name && Number(gid) === ownerGid) allowedGroups.add(name);
  }
  if (!allowedGroups.has(group)) throw new Error(`Groupe refusé : ${group}`);
  const uid = uidOf(owner);
  const gid = gidOfGroup(group);
  if (uid === undefined || gid === undefined) throw new Error('Propriétaire ou groupe introuvable');
  // lchown : jamais à travers un lien (le lien lui-même change de propriétaire)
  withParent(path, (at) => {
    if (!lstatSync(at, { throwIfNoEntry: false })) throw new Error('Cible introuvable');
    if (recursive) walkTree(at, (entry) => lchownSync(entry, uid, gid));
    else lchownSync(at, uid, gid);
  });
}

function typeOfEntry(full: string): 'file' | 'dir' | 'symlink' | 'other' {
  const st = statSync(full);
  if (st.isDirectory()) return 'dir';
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isFile()) return 'file';
  return 'other';
}

async function handlePendingUpdates(family: 'debian' | 'rhel'): Promise<unknown> {
  if (family === 'debian') {
    const out = await tryExec('apt-get', ['--just-print', '--print-uris', 'upgrade']);
    const packages = (out ?? '')
      .split('\n')
      .filter((l) => l.startsWith('Inst '))
      .map((l) => l.split(' ')[1] ?? '')
      .filter(Boolean);
    return { family, count: packages.length, packages };
  }
  const out = await tryExec('dnf', ['--quiet', 'check-update']);
  if (out === null) return { family, count: 0, packages: [] };
  const packages = out
    .split('\n')
    .filter((l) => /^[\w.-]+\.\w+\s+\S+\s+\S+$/.test(l))
    .map((l) => (l.split(/\s+/)[0] ?? '').replace(/\.\w+$/, ''))
      .filter(Boolean);
  return { family, count: packages.length, packages };
}

// --- fail2ban -------------------------------------------------------------------
// Une seule conf générée (jail.d/homeserver.conf, lue après les defaults de la distro).
// L'état éditable est rangé en JSON sur une ligne de commentaire et revalidé à la lecture :
// la conf est toujours régénérée depuis des valeurs bornées, jamais depuis du texte libre.
const F2B_CONF = '/etc/fail2ban/jail.d/homeserver.conf';
const F2B_STATE_PREFIX = '# homeserver-state: ';
const F2B_DEFAULTS = { bantime: 3600, findtime: 600, maxretry: 5 };

function dirHasLog(dirs: string[], re: RegExp): boolean {
  return dirs.some((d) => {
    try { return readdirSync(d).some((f) => re.test(f)); } catch { return false; }
  });
}

/** Jails activables : leur filtre a un journal à lire sur cette machine. */
function f2bAvailableJails(): Fail2banJailName[] {
  const apacheError = dirHasLog(['/var/log/apache2', '/var/log/httpd'], /error[._]log$/);
  const apacheAccess = dirHasLog(['/var/log/apache2', '/var/log/httpd'], /access[._]log$/);
  const nginxError = existsSync('/var/log/nginx/error.log');
  return FAIL2BAN_JAILS.filter((j) => {
    if (j === 'sshd') return true;
    if (j === 'recidive') return existsSync('/var/log/fail2ban.log');
    if (j === 'postfix' || j === 'postfix-sasl') return existsSync('/etc/postfix/main.cf');
    if (j === 'dovecot') return existsSync('/etc/dovecot/dovecot.conf');
    if (j === 'apache-badbots') return apacheAccess;
    if (j.startsWith('apache-')) return apacheError;
    return nginxError;
  });
}

/** Complète la liste des jails (toutes présentes, dans l'ordre du contrat). */
function f2bNormalize(cfg: Fail2banConfig): Fail2banConfig {
  return {
    ...cfg,
    jails: FAIL2BAN_JAILS.map((name) => cfg.jails.find((j) => j.name === name)
      ?? { name, enabled: false, bantime: null, findtime: null, maxretry: null }),
  };
}

function f2bDefaultConfig(web?: 'apache' | 'nginx'): Fail2banConfig {
  const available = f2bAvailableJails();
  const webJail: Fail2banJailName[] = web === 'nginx' ? ['nginx-http-auth'] : web === 'apache' ? ['apache-auth'] : ['apache-auth', 'nginx-http-auth'];
  // fail2ban installé après le service e-mail : ses jails sont actives d'emblée, comme dans l'autre sens
  const mailJails: Fail2banJailName[] = existsSync('/var/lib/homeserver-mail/state.json') ? ['postfix', 'postfix-sasl', 'dovecot'] : [];
  const enabled = new Set<Fail2banJailName>(['sshd', ...[...webJail, ...mailJails].filter((j) => available.includes(j))]);
  return f2bNormalize({
    defaults: { ...F2B_DEFAULTS },
    ignoreip: [],
    jails: FAIL2BAN_JAILS.map((name) => ({ name, enabled: enabled.has(name), bantime: null, findtime: null, maxretry: null })),
  });
}

function f2bReadConfig(): Fail2banConfig | null {
  try {
    const line = readFileSync(F2B_CONF, 'utf8').split('\n').find((l) => l.startsWith(F2B_STATE_PREFIX));
    const cfg = line ? validateFail2banConfig(JSON.parse(line.slice(F2B_STATE_PREFIX.length))) : null;
    return cfg ? f2bNormalize(cfg) : null;
  } catch {
    return null;
  }
}

/**
 * Action de ban adaptée au pare-feu réellement actif : les règles firewalld échouent quand
 * firewalld est arrêté (Fedora Cloud), et iptables manque sur les systèmes récents.
 */
async function f2bBanAction(): Promise<[string, string] | null> {
  if (((await tryExec('systemctl', ['is-active', 'firewalld'])) ?? '').trim() === 'active') {
    return ['firewallcmd-rich-rules', 'firewallcmd-allports'];
  }
  if (existsSync('/usr/sbin/nft')) return ['nftables-multiport', 'nftables-allports'];
  // Explicite : le défaut de Debian 13 est nftables, même quand nft n'est pas installé (le ban échoue alors en silence)
  if (existsSync('/usr/sbin/iptables')) return ['iptables-multiport', 'iptables-allports'];
  return null;
}

/**
 * Compléments aux filtres livrés par les distributions :
 * - postfix : l'unité est postfix@- sur Debian et Ubuntu, et nos ports d'envoi ont leur propre étiquette ;
 * - dovecot : le format « Login aborted » de Dovecot 2.4 n'est reconnu que par certaines versions du filtre.
 */
function f2bFilterFiles(): Record<string, string> {
  return {
    '/etc/fail2ban/filter.d/postfix.local': [
      '# Généré par Homeserver',
      '[Definition]',
      String.raw`_daemon = postfix(-\w+)?/[\w-]+(?:/smtp[ds])?`,
      '',
      '[Init]',
      'journalmatch = SYSLOG_IDENTIFIER=postfix/smtpd + SYSLOG_IDENTIFIER=postfix/submission-587/smtpd + SYSLOG_IDENTIFIER=postfix/submission-465/smtpd',
      '',
    ].join('\n'),
    '/etc/fail2ban/filter.d/dovecot.local': [
      '# Généré par Homeserver',
      '[Definition]',
      'failregex = %(known/failregex)s',
      String.raw`            ^Login aborted: .*\((?:auth failed, \d+ attempts(?: in \d+ secs)?|tried to use (?:disabled|disallowed) \S+ auth)\)(?: \([^)]+\))?:(?: user=<<F-USER>[^>]*</F-USER>>,)?(?: method=\S+,)? rip=<HOST>(?:,|$)`,
      '',
    ].join('\n'),
  };
}

function f2bFiltersCurrent(): boolean {
  return Object.entries(f2bFilterFiles()).every(([path, content]) => existsSync(path) && readFileSync(path, 'utf8') === content);
}

/** Une mise à jour du panel corrige aussi la configuration déjà en place (action de bannissement, filtres). */
async function f2bRepairOnStart(): Promise<void> {
  if (!f2bInstalled() || !existsSync(F2B_CONF)) return;
  const stored = f2bReadConfig();
  if (!stored) return;
  const cfg = f2bNormalize(stored);
  if (readFileSync(F2B_CONF, 'utf8') === f2bRender(cfg, await f2bBanAction()) && f2bFiltersCurrent()) return;
  log('fail2ban : configuration mise à niveau');
  await f2bApply(cfg, await f2bServiceActive());
}

/**
 * IP du serveur : une application locale qui se trompe de mot de passe ne doit pas le faire se bannir lui-même.
 * ignoreself de fail2ban ne suffit pas : il passe par le nom d'hôte, qui résout souvent vers 127.0.1.1.
 */
function f2bSelfAddresses(): string[] {
  return Object.values(networkInterfaces()).flat()
    .filter((a) => a !== undefined && !a.internal && !a.address.startsWith('fe80:'))
    .map((a) => (a as { address: string }).address);
}

function f2bRender(cfg: Fail2banConfig, banAction: [string, string] | null): string {
  const available = new Set(f2bAvailableJails());
  // Debian/Ubuntu récents et Fedora : plus de syslog fichier, sshd n'écrit que dans journald
  const sshJournal = !existsSync('/var/log/auth.log') && !existsSync('/var/log/secure');
  const lines = [
    '# Généré par Homeserver — modifiable depuis le panel (Pare-feu → Fail2ban).',
    '# Toute modification manuelle de ce fichier sera écrasée.',
    `${F2B_STATE_PREFIX}${JSON.stringify(cfg)}`,
    '',
    '[DEFAULT]',
    `bantime = ${cfg.defaults.bantime}`,
    `findtime = ${cfg.defaults.findtime}`,
    `maxretry = ${cfg.defaults.maxretry}`,
    `ignoreip = ${['127.0.0.1/8', '::1', ...f2bSelfAddresses(), ...cfg.ignoreip].join(' ')}`,
  ];
  if (banAction) lines.push(`banaction = ${banAction[0]}`, `banaction_allports = ${banAction[1]}`);
  for (const j of cfg.jails) {
    const on = j.enabled && available.has(j.name);
    lines.push('', `[${j.name}]`, `enabled = ${on}`);
    if (!on) continue;
    if (j.bantime !== null) lines.push(`bantime = ${j.bantime}`);
    if (j.findtime !== null) lines.push(`findtime = ${j.findtime}`);
    if (j.maxretry !== null) lines.push(`maxretry = ${j.maxretry}`);
    // Fedora force backend = systemd par défaut : les jails web/recidive lisent des fichiers
    if (j.name === 'sshd') lines.push(`backend = ${sshJournal ? 'systemd' : 'auto'}`);
    else if (j.name === 'postfix' || j.name === 'postfix-sasl' || j.name === 'dovecot') lines.push('backend = systemd');
    else lines.push('backend = auto');
  }
  return lines.join('\n') + '\n';
}

function cmdError(e: unknown): string {
  const err = e as Error & { stderr?: string };
  const out = (err.stderr ?? '').trim() || err.message;
  return out.split('\n').map((l) => l.trim()).filter(Boolean).slice(-3).join(' | ');
}

/** Sans appel au serveur (fail2ban-client version échoue quand le service est arrêté). */
function f2bInstalled(): boolean {
  return existsSync('/usr/bin/fail2ban-client') || existsSync('/usr/sbin/fail2ban-client');
}

async function f2bServiceActive(): Promise<boolean> {
  return ((await tryExec('systemctl', ['is-active', 'fail2ban'])) ?? '').trim() === 'active';
}

async function f2bWaitReady(timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      await exec('fail2ban-client', ['ping'], 5000);
      return;
    } catch (e) {
      const elapsed = Date.now() - started;
      // service tombé (conf rejetée au démarrage) : inutile d'attendre la fin du délai
      if (elapsed > timeoutMs || (elapsed > 5000 && !(await f2bServiceActive()))) {
        throw new Error(`fail2ban ne répond pas : ${cmdError(e)}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/**
 * Écrit la conf, la valide (fail2ban-client -t) puis recharge (ou démarre) le service.
 * Au moindre échec, l'ancienne conf est remise en place et rechargée.
 */
async function f2bApply(cfg: Fail2banConfig, start = false): Promise<void> {
  const previous = existsSync(F2B_CONF) ? readFileSync(F2B_CONF, 'utf8') : null;
  const restore = (): void => {
    if (previous === null) { try { unlinkSync(F2B_CONF); } catch { /* déjà absent */ } }
    else writeFileSync(F2B_CONF, previous, { mode: 0o644 });
  };
  mkdirSync('/etc/fail2ban/jail.d', { recursive: true });
  const rendered = f2bRender(cfg, await f2bBanAction());
  writeFileSync(F2B_CONF, rendered, { mode: 0o644 });
  if (existsSync('/etc/fail2ban/filter.d')) {
    for (const [path, content] of Object.entries(f2bFilterFiles())) writeFileSync(path, content, { mode: 0o644 });
  }
  await tryExec('restorecon', [F2B_CONF]); // SELinux : contexte du dossier
  try {
    await exec('fail2ban-client', ['-t'], 30_000);
  } catch (e) {
    restore();
    throw new Error(`Configuration refusée par fail2ban-client -t, ancienne configuration rétablie : ${cmdError(e)}`);
  }
  const active = await f2bServiceActive();
  try {
    // Un reload qui change d'action de ban laisse les jails sans aucune action : les IP sont
    // inscrites comme bannies, mais plus rien ne les bloque. Les bans en cours sont repris de sa base.
    const banLine = (conf: string | null): string | undefined => conf?.match(/^banaction = .*$/m)?.[0];
    if (active && banLine(previous) === banLine(rendered)) await exec('fail2ban-client', ['reload'], 60_000);
    else if (active || start) await exec('systemctl', ['restart', 'fail2ban'], 60_000);
    // le serveur met quelques secondes à ouvrir son socket et démarrer ses jails
    if (active || start) await f2bWaitReady();
  } catch (e) {
    restore();
    if (active) await tryExec('fail2ban-client', ['reload']);
    throw new Error(`Rechargement de fail2ban échoué, ancienne configuration rétablie : ${cmdError(e)}`);
  }
}

/** firewalld démarré ou arrêté depuis le panel : l'action de ban de fail2ban doit suivre. */
async function f2bFollowFirewall(): Promise<void> {
  const cfg = f2bReadConfig();
  if (!cfg) return;
  try {
    await f2bApply(cfg);
  } catch (e) {
    log(`fail2ban : conf non regénérée après changement de pare-feu (${(e as Error).message})`);
  }
}

async function f2bJailStatus(jail: string): Promise<{ currentlyBanned: number; totalBanned: number; bannedIps: string[] }> {
  const js = await exec('fail2ban-client', ['status', jail], 10_000);
  const banned = /Currently banned:\s+(\d+)/.exec(js);
  const total = /Total banned:\s+(\d+)/.exec(js);
  const list = /Banned IP list:[ \t]*(.*)$/m.exec(js);
  return {
    currentlyBanned: banned ? Number(banned[1]) : 0,
    totalBanned: total ? Number(total[1]) : 0,
    bannedIps: (list?.[1] ?? '').split(/\s+/).filter(Boolean),
  };
}

async function f2bActiveJails(): Promise<string[]> {
  const stdout = await exec('fail2ban-client', ['status'], 10_000);
  const listLine = stdout.split('\n').find((l) => l.includes('Jail list'));
  return listLine ? listLine.replace(/^.*Jail list:\s*/, '').split(',').map((j) => j.trim()).filter(Boolean) : [];
}

async function f2bInstall(family: 'debian' | 'rhel'): Promise<void> {
  if (f2bInstalled()) return;
  if (family === 'debian') {
    await aptUpdate();
    // python3-systemd : backend journald pour sshd quand /var/log/auth.log n'existe pas
    // nftables : sans lui, l'action par défaut de Debian 13 ne bloque rien
    await pkgInstall(family, ['fail2ban', 'python3-systemd', 'nftables']);
    return;
  }
  // RHEL/Rocky/Alma : fail2ban vient d'EPEL (Fedora l'a dans ses dépôts)
  if (osRelease().ID !== 'fedora' && await tryExec('rpm', ['-q', 'epel-release']) === null) {
    try {
      await dnf(['install', '-y', 'epel-release']);
    } catch (e) {
      throw new Error(`Dépôt EPEL requis pour fail2ban et impossible à installer (${(e as Error).message})`);
    }
  }
  // Pas le méta-paquet « fail2ban » : il tire firewalld, activé sans être démarré, qui
  // fermerait le port du panel au prochain redémarrage. L'action de ban suit le pare-feu actif.
  await pkgInstall(family, ['fail2ban-server', 'fail2ban-systemd']);
}

function mailDeps(family: 'debian' | 'rhel'): MailDeps {
  return {
    family,
    pkgInstall: (packages) => pkgInstall(family, packages),
    pkgRefresh: () => (family === 'debian' ? aptUpdate() : Promise.resolve()),
    log,
    enableMailJails: async () => {
      if (!f2bInstalled()) return;
      const cfg = f2bNormalize(f2bReadConfig() ?? f2bDefaultConfig());
      const mail: Fail2banJailName[] = ['postfix', 'postfix-sasl', 'dovecot'];
      await f2bApply({ ...cfg, jails: cfg.jails.map((j) => (mail.includes(j.name) ? { ...j, enabled: true } : j)) }, true);
    },
  };
}

async function handleRequest(raw: unknown): Promise<unknown> {
  const req = validateRequest(raw);
  if (!req) throw Object.assign(new Error('Requête invalide'), { code: 'VALIDATION' });
  const family = detectFamily();
  if (req.action.startsWith('mail_')) {
    return handleMail(req as MailRequest, mailDeps(family));
  }
  switch (req.action) {
    case 'echo':
      return { echo: true, family };
    case 'install_packages':
      // Le dépôt PHP tiers n'est utile (et risqué) que pour installer PHP
      if (req.packages.some((p) => p.startsWith('php'))) {
        await ensureSuryRepo(family).catch((e: Error) => log(`dépôt PHP ignoré : ${e.message}`));
      } else if (family === 'debian') {
        await aptUpdate().catch((e: Error) => log(`apt-get update : ${e.message}`));
      }
      await pkgInstall(family, req.packages);
      return { family, installed: req.packages };
    case 'discover':
      return handleDiscoverPhp(family);
    case 'write_config': {
      mkdirSync(req.path.replace(/\/[^/]+$/, ''), { recursive: true });
      writeFileSync(req.path, req.content, { mode: 0o644 });
      return { written: req.path };
    }
    case 'read_file': {
      if (!existsSync(req.path)) throw new Error('Fichier introuvable');
      return { content: readFileSync(req.path, 'utf8') };
    }
    case 'list_dir': {
      if (!existsSync(req.path)) return { entries: [] };
      const entries = readdirSync(req.path).map((name) => ({
        name,
        type: typeOfEntry(`${req.path}/${name}`),
      }));
      return { entries };
    }
    case 'unlink': {
      if (!existsSync(req.path) && !statSync(req.path, { throwIfNoEntry: false })) {
        throw new Error('Fichier introuvable');
      }
      const st = statSync(req.path, { throwIfNoEntry: false });
      if (!st) throw new Error('Fichier introuvable');
      if (st.isDirectory()) rmSync(req.path, { recursive: false });
      else unlinkSync(req.path);
      return { removed: req.path };
    }
    case 'site_enable': {
      const base = req.web === 'nginx' ? '/etc/nginx' : (existsSync('/etc/apache2/sites-available') ? '/etc/apache2' : '/etc/httpd');
      const sub = existsSync(`${base}/sites-available`) ? 'sites-available' : 'conf.d';
      const available = `${base}/${sub}/${req.site}`;
      const enabledDir = existsSync(`${base}/sites-enabled`) ? `${base}/sites-enabled` : `${base}/conf.d`;
      const enabled = `${enabledDir}/${req.site}`;
      if (!existsSync(available)) throw new Error(`Site introuvable: ${req.site}`);
      if (req.enable) {
        if (!existsSync(enabledDir)) mkdirSync(enabledDir, { recursive: true });
        if (!existsSync(enabled)) symlinkSync(available, enabled);
      } else {
        if (existsSync(enabled)) unlinkSync(enabled);
      }
      return { site: req.site, enabled: req.enable, web: req.web };
    }
    case 'port_check': {
      const { execFileSync } = await import('node:child_process');
      try {
        execFileSync('ss', ['-tln'], { timeout: 10_000 });
      } catch {
        return { port: req.port, free: true, checked: false };
      }
      const { stdout } = await run('ss', ['-tlnH', `sport = :${req.port}`], { timeout: 10_000 });
      return { port: req.port, free: stdout.trim() === '' };
    }
    case 'node_app_create': {
      assertPanelUser(req.user);
      const nodeBin = nodeBinary();
      const unit = `/etc/systemd/system/${req.name}.service`;
      if (existsSync(unit)) throw new Error(`L'application ${req.name} existe déjà`);
      const home = homeOf(req.user) ?? `/home/${req.user}`;
      const appDir = `${home}/nodeApps/${req.name.replace(/^hs-app-/, '')}`;
      const entry = `${appDir}/${req.entry}`;
      // Arborescence et squelette créés sous l'identité de l'utilisateur (son HOME, ses liens)
      let entryCreated = false;
      {
        const skeleton = `const http = require('node:http');

const port = Number(process.env.PORT ?? ${req.port});
const host = '127.0.0.1';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Bonjour depuis ${req.name}\\n');
});

server.listen(port, host, () => {
  console.log('App ${req.name} à l\'écoute sur http://' + host + ':' + port);
});
`;
        entryCreated = runAsUser(req.user, `
const fs = require('fs');
const [entry, skeleton] = JSON.parse(fs.readFileSync(0, 'utf8'));
fs.mkdirSync(require('path').dirname(entry), { recursive: true, mode: 0o755 });
try { fs.writeFileSync(entry, skeleton, { flag: 'wx', mode: 0o644 }); console.log('created'); }
catch (e) { if (e.code !== 'EEXIST') throw e; }
`, JSON.stringify([entry, skeleton])).trim() === 'created';
      }
      const codePresent = true;
      const unitContent = `[Unit]
Description=Homeserver Node app ${req.name}
After=network.target

[Service]
Type=simple
User=${req.user}
WorkingDirectory=${appDir}
ExecStart=${nodeBin} ${entry}
Environment=PORT=${req.port}
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
      writeFileSync(unit, unitContent, { mode: 0o644 });
      await exec('systemctl', ['daemon-reload']);
      await exec('systemctl', ['enable', req.name]);
      if (codePresent) {
        await exec('systemctl', ['start', req.name]);
      }
      return {
        name: req.name, port: req.port, created: true,
        started: codePresent,
        entryCreated,
        appDir,
        warning: entryCreated ? `Squelette créé: ${entry} — personnalisez-le puis redémarrez l'application` : undefined,
      };
    }
    case 'node_app_delete': {
      const unit = `/etc/systemd/system/${req.name}.service`;
      if (!existsSync(unit)) throw new Error(`Application introuvable: ${req.name}`);
      await exec('systemctl', ['stop', req.name]);
      await exec('systemctl', ['disable', req.name]);
      unlinkSync(unit);
      await exec('systemctl', ['daemon-reload']);
      return { name: req.name, deleted: true };
    }
    case 'node_app_list': {
      if (!existsSync('/etc/systemd/system')) return { apps: [] };
      const apps = readdirSync('/etc/systemd/system')
        .filter((f) => f.startsWith('hs-app-') && f.endsWith('.service'))
        .map((f) => f.replace(/\.service$/, ''));
      const result = await Promise.all(apps.map(async (name) => {
        const content = readFileSync(`/etc/systemd/system/${name}.service`, 'utf8');
        const port = Number(content.match(/Environment=PORT=(\d+)/)?.[1] ?? 0);
        const user = content.match(/User=(.+)/)?.[1] ?? '';
        const active = (await tryExec('systemctl', ['is-active', name]) ?? '').trim() === 'active';
        return { name, port, user, active };
      }));
      return { apps: result };
    }
    case 'node_app_service': {
      if (req.verb === 'status') {
        const active = (await tryExec('systemctl', ['is-active', req.name]) ?? '').trim() === 'active';
        const enabled = (await tryExec('systemctl', ['is-enabled', req.name]) ?? '').trim() === 'enabled';
        return { name: req.name, active, enabled };
      }
      await exec('systemctl', [req.verb, req.name]);
      return { name: req.name, verb: req.verb };
    }
    case 'node_app_info': {
      const unit = `/etc/systemd/system/${req.name}.service`;
      if (!existsSync(unit)) throw new Error(`Application introuvable: ${req.name}`);
      const content = readFileSync(unit, 'utf8');
      const port = Number(content.match(/Environment=PORT=(\d+)/)?.[1] ?? 0);
      const user = content.match(/User=(.+)/)?.[1] ?? '';
      const appDir = content.match(/WorkingDirectory=(.+)/)?.[1] ?? '';
      const entry = (content.match(/ExecStart=\S+ (.+)/)?.[1] ?? '').replace(appDir + '/', '');
      const active = (await tryExec('systemctl', ['is-active', req.name]) ?? '').trim() === 'active';
      const enabled = (await tryExec('systemctl', ['is-enabled', req.name]) ?? '').trim() === 'enabled';
      const pid = Number((await tryExec('systemctl', ['show', req.name, '--property=MainPID', '--value']) ?? '0').trim());
      let cpuPercent: number | null = null;
      let memPercent: number | null = null;
      let memBytes: number | null = null;
      if (pid > 0) {
        const ps = await tryExec('ps', ['-p', String(pid), '-o', '%cpu,%mem,rss,--no-headers']);
        if (ps && ps.trim() !== '') {
          const parts = ps.trim().split(/\s+/);
          cpuPercent = Number(parts[0]);
          memPercent = Number(parts[1]);
          memBytes = Number(parts[2]) * 1024;
        }
      }
      const log = (await tryExec('journalctl', ['-u', req.name, '-n', '200', '--no-pager', '-o', 'short'])) ?? '';
      return {
        name: req.name, port, user, appDir, entry, active, enabled, pid: pid > 0 ? pid : null,
        cpuPercent, memPercent, memBytes,
        log: log.split('\n'),
      };
    }
    case 'node_app_update': {
      const unit = `/etc/systemd/system/${req.name}.service`;
      if (!existsSync(unit)) throw new Error(`Application introuvable: ${req.name}`);
      let content = readFileSync(unit, 'utf8');
      if (req.port !== undefined) {
        content = content.replace(/Environment=PORT=\d+/g, `Environment=PORT=${req.port}`);
      }
      if (req.entry !== undefined) {
        const appDir = content.match(/WorkingDirectory=(.+)/)?.[1] ?? '';
        const nodeBin = content.match(/ExecStart=(\S+)/)?.[1] ?? 'node';
        content = content.replace(/ExecStart=.+/g, `ExecStart=${nodeBin} ${appDir}/${req.entry}`);
      }
      writeFileSync(unit, content, { mode: 0o644 });
      await exec('systemctl', ['daemon-reload']);
      const active = (await tryExec('systemctl', ['is-active', req.name]) ?? '').trim() === 'active';
      if (active) await exec('systemctl', ['restart', req.name]);
      return { name: req.name, updated: true, restarted: active };
    }
    case 'web_server_detect': {
      const servers: Array<{ name: 'apache' | 'nginx'; unit: string; installed: boolean; active: boolean }> = [];
      for (const [name, unit] of [['apache', 'apache2'], ['nginx', 'nginx']] as const) {
        const installed = (await tryExec('sh', ['-c', `command -v ${unit} || command -v httpd`])) !== null;
        const active = installed ? (await tryExec('systemctl', ['is-active', unit]) ?? '').trim() === 'active' : false;
        servers.push({ name, unit: (await tryExec('sh', ['-c', `command -v ${unit}`])) ? unit : unit, installed, active });
      }
      return { servers };
    }
    case 'pending_updates':
      return handlePendingUpdates(family);
    case 'packages_upgrade': {
      if (family === 'debian') {
        await aptUpdate(true);
        await apt(['-y', 'upgrade']);
        return { family, upgraded: true };
      }
      await dnf(['-y', 'upgrade']);
      return { family, upgraded: true };
    }
    case 'user_create': {
      if (req.home === '/dev/null') {
        // compat: home par défaut /home/<user>
      }
      const home = req.home === '/dev/null' ? `/home/${req.username}` : req.home;
      // Un compte existant qui n'a pas été créé par le panel (root, admin, service) n'est
      // jamais repris : sinon user_create servirait à changer son mot de passe.
      if (uidOf(req.username) !== undefined && !isPanelUser(req.username)) {
        throw new Error(`L'utilisateur ${req.username} existe déjà (compte non géré par le panel)`);
      }
      const homeSt = lstatSync(home, { throwIfNoEntry: false });
      if (homeSt && !homeSt.isDirectory()) throw new Error(`${home} existe et n'est pas un répertoire`);
      mkdirSync('/home', { recursive: true });
      if (!homeSt) mkdirSync(home, { mode: 0o755 });
      await exec('groupadd', ['-f', 'homeserver-web']);
      await exec('groupadd', ['-f', 'homeserver-sftp']);
      const group = req.shell === '/bin/bash' ? 'homeserver-web' : 'homeserver-sftp';
      const useraddArgs = ['-m', '-d', home, '-s', req.shell, '-G', group, req.username];
      try {
        await exec('useradd', useraddArgs);
      } catch (err) {
        const e = err as { message: string };
        if (!e.message.includes('already exists')) throw err;
      }
      try {
        setUnixPassword(req.username, req.password);
      } catch (err) {
        const e = err as { message: string };
        throw new Error(`Définition du mot de passe échouée: ${e.message}`);
      }
      try { await exec('usermod', ['-U', req.username]); } catch { /* deja deverrouille */ }
      if (lstatSync(home, { throwIfNoEntry: false })?.isDirectory()) {
        try { chmodSync(home, 0o755); } catch { /* no-op */ }
        const uid = uidOf(req.username);
        const gid = gidOf(req.username);
        if (uid !== undefined && gid !== undefined) {
          for (const sub of ['www', 'nodeApps']) {
            const subPath = `${home}/${sub}`;
            const st = lstatSync(subPath, { throwIfNoEntry: false });
            if (st && !st.isDirectory()) continue; // lien posé par l'utilisateur : jamais suivi
            if (!st) mkdirSync(subPath, { mode: 0o755 });
            lchownSync(subPath, uid, gid);
          }
        }
      }
      return { username: req.username, created: true };
    }
    case 'user_set_password': {
      assertPanelUser(req.username);
      setUnixPassword(req.username, req.password);
      try { await exec('usermod', ['-U', req.username]); } catch { /* deja deverrouille */ }
      return { username: req.username, updated: true };
    }
    case 'user_delete': {
      assertPanelUser(req.username);
      // tuer toutes les sessions/processus de l'utilisateur avant suppression
      try { await exec('pkill', ['-STOP', '-u', req.username]); } catch { /* aucun processus */ }
      try { await exec('pkill', ['-KILL', '-u', req.username]); } catch { /* aucun processus */ }
      // terminer ses sessions systemd (loginctl) sinon userdel peut echouer
      try { await exec('loginctl', ['terminate-user', req.username]); } catch { /* aucune session */ }
      const home = homeOf(req.username);
      const args = req.removeHome ? ['-r', req.username] : [req.username];
      try {
        await exec('userdel', args);
      } catch (err) {
        // certains userdel sortent en erreur si le home a deja ete supprime ou si des crontabs
        // referencent l'utilisateur ; on retente en mode non recursif puis on verifie
        const still = await tryExec('id', [req.username]);
        if (still !== null) throw err;
      }
      let homeRemoved = false;
      if (req.removeHome && home !== undefined && /^\/home\/[a-z_][a-z0-9_-]{0,31}$/.test(home)) {
        // rmSync ne suit pas les liens ; plus aucun processus de l'utilisateur ne tourne
        if (lstatSync(home, { throwIfNoEntry: false })?.isDirectory()) rmSync(home, { recursive: true, force: true });
        homeRemoved = !existsSync(home);
      }
      return { username: req.username, deleted: true, homeRemoved };
    }
    case 'user_ssh_keys_list': {
      assertPanelUser(req.username);
      const out = runAsUser(req.username, SSH_KEYS_SCRIPT, JSON.stringify({ op: 'list' }));
      return { username: req.username, keys: (JSON.parse(out) as { keys: string[] }).keys };
    }
    case 'user_ssh_keys_add': {
      assertPanelUser(req.username);
      ensureSshDir(req.username);
      const res = JSON.parse(runAsUser(req.username, SSH_KEYS_SCRIPT, JSON.stringify({ op: 'add', key: req.key }))) as { count: number };
      return { username: req.username, added: true, count: res.count };
    }
    case 'user_ssh_keys_remove': {
      assertPanelUser(req.username);
      const res = JSON.parse(runAsUser(req.username, SSH_KEYS_SCRIPT, JSON.stringify({ op: 'remove', index: req.index }))) as { count: number };
      return { username: req.username, removed: true, count: res.count };
    }
    case 'sftp_configure': {
      const confPath = '/etc/ssh/sshd_config.d/homeserver-sftp.conf';
      const dir = '/etc/ssh/sshd_config.d';
      const content = [
        '# managed by homeserver — SFTP chrooté pour les utilisateurs SFTP uniquement',
        '# autoriser explicitement le mot de passe pour les utilisateurs du panel',
        '# (les images cloud Ubuntu desactivent PasswordAuthentication globalement)',
        'Match Group homeserver-web',
        '    PasswordAuthentication yes',
        '    KbdInteractiveAuthentication yes',
        'Match Group homeserver-sftp',
        '    PasswordAuthentication yes',
        '    KbdInteractiveAuthentication yes',
        '    ChrootDirectory %h',
        '    ForceCommand internal-sftp',
        '    AllowTcpForwarding no',
        '    X11Forwarding no',
      ].join('\n') + '\n';
      try {
        await exec('groupadd', ['-f', 'homeserver-sftp']);
      } catch { /* groupe existant */ }
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const existing = existsSync(confPath) ? readFileSync(confPath, 'utf8') : '';
      if (existing !== content) writeFileSync(confPath, content, { mode: 0o644 });
      let sshdTestErr: string | null = null;
      try {
        await run('/usr/sbin/sshd', ['-t'], { timeout: 30_000 });
      } catch (err) {
        sshdTestErr = (err as { stderr?: string; message?: string }).stderr
          ?? (err as { message?: string }).message
          ?? 'erreur inconnue';
      }
      if (sshdTestErr !== null) throw new Error(`Configuration sshd invalide: ${sshdTestErr}`);
      let reloaded = false;
      let reloadError: string | undefined;
      for (const unit of ['ssh', 'sshd']) {
        try {
          await exec('systemctl', ['reload', unit]);
          reloaded = true;
          break;
        } catch (err) {
          reloadError = (err as Error).message;
        }
      }
      if (!reloaded) {
        try {
          const pidOut = await tryExec('systemctl', ['show', '-p', 'MainPID', '--value', 'ssh']);
          const pid = Number((pidOut ?? '').trim());
          if (pid > 0) {
            process.kill(pid, 'SIGHUP');
            reloaded = true;
            reloadError = undefined;
          }
        } catch (err) {
          reloadError = (err as Error).message;
        }
      }
      return { configured: true, confPath, reloaded, ...(reloadError ? { reloadError } : {}) };
    }
    case 'user_list': {
      const panelGroups = ['homeserver-web', 'homeserver-sftp'];
      const panelUsers = new Set<string>();
      for (const g of panelGroups) {
        const out = await tryExec('getent', ['group', g]);
        if (out === null) continue;
        const members = (out.trim().split(':')[3] ?? '').split(',').map((m) => m.trim()).filter((m) => m.length > 0);
        for (const m of members) panelUsers.add(m);
      }
      const passwd = await exec('getent', ['passwd']);
      const users = passwd.trim().split('\n').map((line) => {
        const [username, , uid, gid, , home, shell] = line.split(':');
        return { username: username ?? '', uid: Number(uid), gid: Number(gid), home: home ?? '', shell: shell ?? '' };
      }).filter((u) => panelUsers.has(u.username));
      return { users };
    }
    case 'fs_read':
      return { content: fsReadSafe(req.path) };
    case 'fs_write':
      fsWriteSafe(req.path, req.content);
      return { written: req.path, bytes: Buffer.byteLength(req.content) };
    case 'fs_list': {
      const clean = req.path.replace(/\/+$/, '');
      if (!lstatSync(clean, { throwIfNoEntry: false })) return { entries: [] };
      return { entries: fsListSafe(clean) };
    }
    case 'fs_mkdir':
      fsMkdirSafe(req.path);
      return { created: req.path };
    case 'fs_delete':
      await fsDeleteSafe(req.path);
      return { removed: req.path };
    case 'fs_chown':
      await fsChownSafe(req.path, req.owner, req.group, req.recursive);
      return { path: req.path, owner: req.owner };
    case 'packages_remove':
      if (family === 'debian') await apt(['remove', '-y', ...req.packages]);
      else await dnf(['remove', '-y', ...req.packages]);
      return { family, removed: req.packages };
    case 'cert_issue': {
      const args = ['--apache', '-d', req.domain, '--non-interactive', '--agree-tos', '-m', req.email, '--keep-until-expiring', '--redirect'];
      const out = await exec('certbot', args);
      return { domain: req.domain, issued: true, output: out.slice(0, 2000) };
    }
    case 'cert_renew': {
      const out = await exec('certbot', ['renew', '--cert-name', req.domain, '--non-interactive']);
      return { domain: req.domain, renewed: true, output: out.slice(0, 2000) };
    }
    case 'cert_info': {
      const liveDir = `/etc/letsencrypt/live/${req.domain}`;
      if (!existsSync(`${liveDir}/fullchain.pem`)) throw new Error(`Aucun certificat pour ${req.domain}`);
      const { stdout } = await run('openssl', ['x509', '-in', `${liveDir}/fullchain.pem`, '-noout', '-enddate', '-subject', '-issuer'], { timeout: 15_000 });
      const notAfter = stdout.match(/notAfter=(.+)/)?.[1] ?? '';
      const expiresAt = notAfter ? new Date(notAfter).toISOString() : null;
      const daysLeft = expiresAt ? Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000) : null;
      const renewal = `/etc/letsencrypt/renewal/${req.domain}.conf`;
      return {
        domain: req.domain,
        subject: stdout.match(/subject=(.+)/)?.[1] ?? '',
        issuer: stdout.match(/issuer=(.+)/)?.[1] ?? '',
        expiresAt,
        daysLeft,
        autoRenew: existsSync(renewal),
      };
    }
    case 'db_query': {
      if (req.sql === 'list_databases') {
        const out = await exec('mariadb', ['-N', '-B', '-e', 'SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ("mysql","information_schema","performance_schema","sys")']);
        return { databases: out.trim().split('\n').filter(Boolean) };
      }
      if (req.sql === 'db_size') {
        const out = await exec('mariadb', ['-N', '-B', '-e', `SELECT COALESCE(ROUND(SUM(data_length+index_length)/1024/1024,2),0) FROM information_schema.tables WHERE table_schema='${req.arg}'`]);
        return { database: req.arg, sizeMb: Number(out.trim()) };
      }
      if (req.sql === 'list_users') {
        const out = await exec('mariadb', ['-N', '-B', '-e', 'SELECT user, host FROM mysql.user WHERE user NOT IN ("root","mysql","mariadb.sys","mariadb")']);
        const users = out.trim().split('\n').filter(Boolean).map((l) => { const [user, host] = l.split('\t'); return { user, host: host ?? '%' }; });
        return { users };
      }
      const out = await exec('mariadb', ['-N', '-B', '-e', 'SELECT user, host, Db, privilege_type FROM mysql.db WHERE user NOT IN ("root")']);
      const grants = out.trim().split('\n').filter(Boolean).map((l) => { const [user, host, db, priv] = l.split('\t'); return { user: user ?? '', host: host ?? '', database: db ?? '', privilege: priv ?? '' }; });
      return { grants };
    }
    case 'db_admin': {
      const sql = (s: string) => exec('mariadb', ['-e', s]);
      const q = (v: string) => v.replace(/'/g, "''");
      switch (req.op) {
        case 'create_db':
          await sql(`CREATE DATABASE IF NOT EXISTS \`${req.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
          return { database: req.database, created: true };
        case 'drop_db':
          await sql(`DROP DATABASE IF EXISTS \`${req.database}\`;`);
          return { database: req.database, dropped: true };
        case 'create_user': {
          await sql(`CREATE USER IF NOT EXISTS '${req.username}'@'%' IDENTIFIED BY '${q(req.password ?? '')}';`);
          await sql(`CREATE USER IF NOT EXISTS '${req.username}'@'localhost' IDENTIFIED BY '${q(req.password ?? '')}';`);
          return { username: req.username, created: true };
        }
        case 'drop_user':
          await sql(`DROP USER IF EXISTS '${req.username}'@'%';`);
          await sql(`DROP USER IF EXISTS '${req.username}'@'localhost';`);
          return { username: req.username, dropped: true };
        case 'grant':
          await sql(`GRANT ALL PRIVILEGES ON \`${req.database}\`.* TO '${req.username}'@'%';`);
          await sql(`GRANT ALL PRIVILEGES ON \`${req.database}\`.* TO '${req.username}'@'localhost';`);
          await sql('FLUSH PRIVILEGES;');
          return { database: req.database, username: req.username, granted: true };
        case 'revoke':
          await sql(`REVOKE ALL PRIVILEGES ON \`${req.database}\`.* FROM '${req.username}'@'%';`);
          await sql(`REVOKE ALL PRIVILEGES ON \`${req.database}\`.* FROM '${req.username}'@'localhost';`);
          await sql('FLUSH PRIVILEGES;');
          return { database: req.database, username: req.username, revoked: true };
        case 'set_password':
          await sql(`ALTER USER '${req.username}'@'%' IDENTIFIED BY '${q(req.password ?? '')}';`);
          await sql(`ALTER USER '${req.username}'@'localhost' IDENTIFIED BY '${q(req.password ?? '')}';`);
          return { username: req.username, updated: true };
      }
      throw Object.assign(new Error('Opération inconnue'), { code: 'UNKNOWN_ACTION' });
    }
    case 'firewall_status': {
      const ufw = await tryExec('ufw', ['status']);
      if (ufw !== null) {
        return {
          backend: 'ufw',
          active: ufw.includes('Status: active'),
          rules: ufw.split('\n').filter((l) => /\s\d+(\/tcp|\/udp|\s)/.test(l)).map((l) => l.trim()),
        };
      }
      const fwalld = await tryExec('firewall-cmd', ['--list-all']);
      if (fwalld !== null) {
        const ports = (fwalld.match(/ports:\s*(.+)/)?.[1] ?? '').trim().split(/\s+/).filter(Boolean);
        return {
          backend: 'firewalld',
          active: fwalld.includes('active'),
          rules: ports,
        };
      }
      throw new Error('Aucun pare-feu trouvé (ufw ou firewalld requis)');
    }
    case 'firewall_enable': {
      if (req.enable) {
        const ufw = await tryExec('ufw', ['--version']);
        if (ufw !== null) {
          await exec('bash', ['-c', 'echo y | ufw enable']);
          await exec('ufw', ['default', 'deny', 'incoming']);
          await exec('ufw', ['default', 'allow', 'outgoing']);
        } else {
          await exec('systemctl', ['enable', '--now', 'firewalld']);
          await f2bFollowFirewall();
        }
        return { active: true };
      }
      const ufw = await tryExec('ufw', ['--version']);
      if (ufw !== null) await exec('ufw', ['disable']);
      else {
        await exec('systemctl', ['stop', 'firewalld']);
        await f2bFollowFirewall();
      }
      return { active: false };
    }
    case 'firewall_rule_add':
    case 'firewall_rule_remove': {
      const ufw = await tryExec('ufw', ['--version']);
      const spec = `${req.port}/${req.proto}`;
      const verb = req.action === 'firewall_rule_add' ? (req.rule === 'allow' ? 'allow' : 'deny') : 'delete';
      if (ufw !== null) {
        if (req.action === 'firewall_rule_add' && req.rule === 'deny') {
          throw new Error('ufw ne supporte pas deny par port (politique deny incoming par défaut)');
        }
        await exec('ufw', [verb, spec]);
      } else {
        if (req.action === 'firewall_rule_add') {
          await exec('firewall-cmd', ['--add-port=' + spec, '--permanent']);
        } else {
          await exec('firewall-cmd', ['--remove-port=' + spec, '--permanent']);
        }
        await exec('firewall-cmd', ['--reload']);
      }
      return { port: req.port, proto: req.proto, rule: req.rule, applied: true };
    }
    case 'backup_create': {
      assertPanelUser(req.site.split('/')[0] ?? '');
      // Sauvegardes lisibles par root seul (elles contiennent les sites de tous les utilisateurs)
      mkdirSync('/var/backups/homeserver', { recursive: true, mode: 0o700 });
      chmodSync('/var/backups/homeserver', 0o700);
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const file = `homeserver-${req.site}-${stamp}.tar.gz`;
      const target = `/var/backups/homeserver/${file}`;
      await exec('tar', ['-czf', target, '-C', '/home/' + req.site.split('/')[0], 'www/' + req.site.split('/').slice(1).join('/')]);
      chmodSync(target, 0o600);
      const st = statSync(target);
      return { file, site: req.site, sizeBytes: st.size, createdAt: new Date().toISOString() };
    }
    case 'backup_list': {
      const dir = '/var/backups/homeserver';
      if (!existsSync(dir)) return { backups: [] };
      const backups = readdirSync(dir).filter((f) => /^homeserver-[A-Za-z0-9._-]+\.tar\.gz$/.test(f)).map((f) => {
        const st = statSync(`${dir}/${f}`);
        const m = f.match(/^homeserver-(.+?)-\d{4}-\d{2}-\d{2}/);
        return { file: f, site: m?.[1] ?? 'unknown', sizeBytes: st.size, createdAt: st.mtime.toISOString() };
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { backups };
    }
    case 'backup_delete': {
      const target = `/var/backups/homeserver/${req.file}`;
      if (!existsSync(target)) throw new Error('Sauvegarde introuvable');
      unlinkSync(target);
      return { file: req.file, deleted: true };
    }
    case 'backup_restore': {
      const target = `/var/backups/homeserver/${req.file}`;
      if (!existsSync(target)) throw new Error('Sauvegarde introuvable');
      const user = req.site.split('/')[0] ?? '';
      assertPanelUser(user);
      // Extraction sous l'identité de l'utilisateur (archive lue par root, passée sur stdin) :
      // ni propriétaires imposés par l'archive, ni écriture à travers ses liens
      const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const res = spawnSync('tar', ['-xzf', '-', '-C', homeOf(user) ?? `/home/${user}`, '--no-same-owner'], {
          uid: uidOf(user), gid: gidOf(user), stdio: [fd, 'ignore', 'pipe'], timeout: 600_000, encoding: 'utf8',
        });
        if (res.status !== 0) throw new Error(`Restauration échouée : ${(res.stderr || res.error?.message || '').trim().split('\n').pop()}`);
      } finally { closeSync(fd); }
      return { file: req.file, site: req.site, restored: true };
    }
    case 'cron_write': {
      const path = `/etc/cron.d/${req.file}`;
      writeFileSync(path, req.content.endsWith('\n') ? req.content : req.content + '\n', { mode: 0o644 });
      return { file: req.file, written: true };
    }
    case 'cron_delete': {
      const path = `/etc/cron.d/${req.file}`;
      if (!existsSync(path)) throw new Error('Tâche introuvable');
      unlinkSync(path);
      return { file: req.file, deleted: true };
    }
    case 'dns_slaves_config': {
      const confDir = existsSync('/etc/bind') ? '/etc/bind' : '/etc/named';
      const zonesDir = bindZonesDir();
      const includeFile = `${confDir}/homeserver-zones.conf`;
      const ipList = req.slaves.map((s) => s.ip);
      const transferBlock = ipList.length > 0
        ? [`  allow-transfer { ${ipList.join('; ')}; };`, `  also-notify { ${ipList.join('; ')}; };`]
        : [];
      const zoneFiles = existsSync(zonesDir)
        ? readdirSync(zonesDir).filter((f) => f.endsWith('.zone'))
        : [];
      const lines = [
        '// Généré par Homeserver — ne pas éditer manuellement',
      ];
      for (const zf of zoneFiles) {
        const domain = zf.replace(/\.zone$/, '');
        lines.push(
          `zone "${domain}" {`,
          '  type master;',
          `  file "${zonesDir}/${zf}";`,
          // Zone publique (RHEL/Fedora limitent allow-query à localhost globalement) ; la récursion reste locale
          '  allow-query { any; };',
          ...transferBlock,
          '};',
          '',
        );
      }
      writeFileSync(includeFile, lines.join('\n') + '\n', { mode: 0o644 });
      if (confDir === '/etc/named') ensureRhelNamedConf(includeFile);
      const namedConf = `${confDir}/named.conf.local`;
      const includeLine = `include "${includeFile}";`;
      const currentConf = existsSync(namedConf) ? readFileSync(namedConf, 'utf8') : '';
      const cleaned = currentConf
        .split('\n')
        .filter((l) => !l.includes('homeserver-slaves.conf') && !l.includes('homeserver-zones.conf'))
        .join('\n')
        .trimEnd();
      const nextConf = cleaned.length > 0 ? `${cleaned}\n${includeLine}\n` : `${includeLine}\n`;
      writeFileSync(namedConf, nextConf, { mode: 0o644 });
      const oldSlavesFile = `${confDir}/homeserver-slaves.conf`;
      if (existsSync(oldSlavesFile)) unlinkSync(oldSlavesFile);
      const checker = existsSync('/usr/sbin/named-checkconf') ? '/usr/sbin/named-checkconf' : 'named-checkconf';
      try {
        await exec(checker, []);
      } catch (err) {
        throw new Error(`Configuration Bind invalide: ${(err as Error).message}`);
      }
      const unit = existsSync('/etc/bind') ? 'bind9' : 'named';
      await exec('systemctl', ['reload', unit]);
      return { slaves: req.slaves, zones: zoneFiles.length, applied: true };
    }
    case 'dns_soa_query': {
      const { stdout } = await run('dig', [`@${req.server}`, req.zone, 'SOA', '+short', '+time=3', '+tries=1'], { timeout: 10_000 });
      const soa = stdout.trim().split(/\s+/);
      if (soa.length < 3) throw new Error(`Pas de réponse SOA depuis ${req.server}`);
      return { server: req.server, zone: req.zone, serial: Number(soa[2] ?? 0) };
    }
    case 'check_zone': {
      const checker = existsSync('/usr/sbin/named-checkzone') ? '/usr/sbin/named-checkzone' : 'named-checkzone';
      try {
        await exec(checker, [req.zone, req.file]);
        return { valid: true };
      } catch (err) {
        const e = err as { stderr?: string; message: string };
        return { valid: false, errors: (e.stderr ?? e.message).trim() };
      }
    }
    case 'panel_check': {
      // Throttling : le check GitHub n'est relancé que si l'état est absent ou vieux (> 30 min).
      // Sinon on ne fait que lire update-status.json — le poll du front ne doit pas
      // déclencher de requêtes API GitHub (rate limit 60 req/h en anonyme).
      // « Vérifier maintenant » (force) : au plus un check par minute.
      const maxAge = req.force ? 60_000 : 30 * 60_000;
      let stale = true;
      try {
        const st = readJsonState(STATUS_FILE, '');
        const last = typeof st.lastCheck === 'string' ? Date.parse(st.lastCheck) : NaN;
        stale = !Number.isFinite(last) || Date.now() - last > maxAge;
      } catch { /* pas encore d'état */ }
      if (stale) {
        try {
          await exec('systemctl', ['start', 'hs-updater-check.service']);
        } catch {
          // check en échec (réseau, rate limit) : on rend l'état tel quel, avec son erreur
        }
      }
      return readJsonState(STATUS_FILE, 'État de mise à jour indisponible');
    }
    case 'panel_update': {
      // Lancement NON BLOQUANT : l'apply (npm ci + builds) prend plusieurs minutes.
      // On démarre le service en arrière-plan et on rend la main immédiatement —
      // le front suit la progression via panel.check (lastRun.result === 'running').
      // L'état lu tout de suite serait encore celui du run PRÉCÉDENT (« ok » d'hier → le
      // front croirait la mise à jour finie) : on attend que l'apply ait écrit le sien.
      const runAt = (): unknown => {
        try { return (readJsonState(STATUS_FILE, '').lastRun as { at?: unknown } | null)?.at ?? null; } catch { return null; }
      };
      const before = runAt();
      await exec('systemctl', ['start', '--no-block', 'hs-updater-apply.service'], 30_000);
      for (let i = 0; i < 30 && runAt() === before; i++) await new Promise((r) => setTimeout(r, 500));
      const state = readJsonState(STATUS_FILE, 'État de mise à jour indisponible');
      if (runAt() === before) {
        return { ...state, lastRun: { at: new Date().toISOString(), result: 'running', message: 'mise à jour lancée' } };
      }
      return state;
    }
    case 'panel_rollback': {
      const before = await tryExec('systemctl', ['is-active', 'homeserver']);
      const state = readJsonState(INSTALLED_FILE, 'installed.json introuvable');
      const prev = state.previous;
      if (typeof prev !== 'string' || !VERSION_RE.test(prev)) throw new Error('Aucune release précédente');
      if (!lstatSync(`${RELEASES_DIR}/${prev}`, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Release ${prev} absente du disque`);
      const cur = readFileSync(`${CURRENT_LINK}/VERSION`, 'utf8').trim();
      switchCurrent(prev);
      writeJsonState(INSTALLED_FILE, {
        ...state,
        current: prev,
        previous: VERSION_RE.test(cur) && cur !== prev ? cur : null,
        updatedAt: new Date().toISOString(),
        history: [...(Array.isArray(state.history) ? state.history : []).slice(-19), { version: prev, at: new Date().toISOString(), status: 'rollback' }],
      });
      // État de mise à jour invalidé : la version quittée redevient proposée au prochain check
      try {
        const st = readJsonState(STATUS_FILE, '');
        delete st.lastCheck;
        writeJsonState(STATUS_FILE, { ...st, available: false, latest: null, lastRun: { at: new Date().toISOString(), result: 'ok', message: `retour manuel à la version ${prev}` } });
      } catch { /* pas encore d'état de mise à jour */ }
      // Redémarrage DIFFÉRÉ : redémarrer hs-helper ici tuerait ce processus avant sa réponse
      // (le panel afficherait une erreur alors que le retour arrière a réussi).
      // AccuracySec : sans lui, systemd regroupe les timers à la minute (déclenchement après ~10 s)
      await exec('systemd-run', ['--quiet', '--collect', '--on-active=2', '--timer-property=AccuracySec=100ms', `--unit=hs-panel-restart-${Date.now()}`,
        '/bin/sh', '-c', 'systemctl reset-failed hs-helper homeserver; systemctl restart hs-helper homeserver'], 15_000);
      return { rolledBack: true, current: prev, restarting: true, wasActive: (before ?? '').trim() === 'active' };
    }
    case 'panel_releases': {
      const state = readJsonState(INSTALLED_FILE, 'installed.json introuvable');
      const releases = existsSync(RELEASES_DIR)
        ? readdirSync(RELEASES_DIR, { withFileTypes: true })
          .filter((e) => e.isDirectory() && VERSION_RE.test(e.name))
          .map((e) => e.name)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        : [];
      const sizes: Record<string, number> = {};
      for (const v of releases) {
        const out = await tryExec('du', ['-sm', `${RELEASES_DIR}/${v}`]);
        const mb = Number((out ?? '').split(/\s+/)[0]);
        if (Number.isFinite(mb)) sizes[v] = mb;
      }
      return {
        releases,
        current: state.current ?? null,
        previous: state.previous ?? null,
        sizes,
      };
    }
    case 'panel_release_delete': {
      const state = readJsonState(INSTALLED_FILE, 'installed.json introuvable');
      const active = readFileSync(`${CURRENT_LINK}/VERSION`, 'utf8').trim();
      if (req.version === state.current || req.version === active) throw new Error('Impossible de supprimer la release active');
      if (req.version === state.previous) throw new Error('Impossible de supprimer la release précédente (plan de retour arrière)');
      const target = `${RELEASES_DIR}/${req.version}`;
      const st = lstatSync(target, { throwIfNoEntry: false });
      if (!st || !st.isDirectory()) throw new Error('Release introuvable');
      rmSync(target, { recursive: true });
      return { deleted: true, version: req.version };
    }
    case 'panel_access_status': {
      const envFile = findPanelEnv();
      if (!envFile) return { host: '127.0.0.1', port: Number(process.env.HS_PORT ?? 3000) || 3000, secureCookies: true, envFile: null };
      const env = readPanelEnv(envFile);
      const host = env.match(/^HS_HOST=(.+)$/m)?.[1]?.trim() ?? '127.0.0.1';
      const port = Number(env.match(/^HS_PORT=(.+)$/m)?.[1]?.trim() ?? '3000') || 3000;
      const secureCookies = (env.match(/^HS_SECURE_COOKIES=(.+)$/m)?.[1]?.trim() ?? 'true') === 'true';
      return { host, port, secureCookies, envFile };
    }
    case 'panel_access_set': {
      const envFile = findPanelEnv();
      if (!envFile) throw new Error('.env du panel introuvable');
      const secureCookies = req.host === '127.0.0.1';
      let env = readPanelEnv(envFile);
      const setVar = (key: string, value: string): void => {
        const re = new RegExp(`^${key}=.*$`, 'm');
        if (re.test(env)) env = env.replace(re, `${key}=${value}`);
        else env += `${env.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
      };
      setVar('HS_HOST', req.host);
      setVar('HS_SECURE_COOKIES', secureCookies ? 'true' : 'false');
      writePanelEnv(envFile, env);
      await exec('systemctl', ['restart', 'homeserver'], 30_000);
      return { host: req.host, secureCookies, envFile, restarted: true };
    }
    case 'panel_https_status': {
      const confPath = '/etc/apache2/sites-available/homeserver-panel.conf';
      const httpdConfPath = '/etc/httpd/conf.d/homeserver-panel.conf';
      const confExists = existsSync(confPath) || existsSync(httpdConfPath);
      let liveDomain: string | null = null;
      try {
        const envFile = findPanelEnv();
        const env = envFile ? readPanelEnv(envFile) : '';
        liveDomain = env.match(/^HS_PANEL_DOMAIN=(.+)$/m)?.[1]?.trim() ?? null;
      } catch { /* pas de .env */ }
      return { enabled: confExists, domain: liveDomain };
    }
    case 'panel_https_setup': {
      // 1. Vhost Apache 80 pour le domaine (prérequis validation ACME)
      const isDebian = existsSync('/etc/apache2');
      if (!isDebian && !existsSync('/etc/httpd')) throw new Error('Apache non installé — HTTPS automatique du panel disponible uniquement avec Apache');
      const confDir = isDebian ? '/etc/apache2/sites-available' : '/etc/httpd/conf.d';
      const confPath = `${confDir}/homeserver-panel.conf`;
      // Le helper n'hérite pas du .env du panel : le port réel y est lu
      const panelEnv = findPanelEnv();
      const port = Number((panelEnv ? readPanelEnv(panelEnv) : '').match(/^HS_PORT=(\d+)/m)?.[1] ?? process.env.HS_PORT ?? 3000) || 3000;
      // Modules requis par les vhosts ci-dessous (absents d'une installation Apache fraîche)
      if (isDebian) await exec('a2enmod', ['-q', 'proxy', 'proxy_http', 'ssl', 'headers'], 30_000);
      else if (!existsSync('/etc/httpd/conf.d/ssl.conf')) await pkgInstall('rhel', ['mod_ssl']);
      const httpConf = [
        `<VirtualHost *:80>`,
        `  ServerName ${req.domain}`,
        `  ProxyPreserveHost On`,
        `  ProxyPass / http://127.0.0.1:${port}/`,
        `  ProxyPassReverse / http://127.0.0.1:${port}/`,
        `</VirtualHost>`,
      ].join('\n') + '\n';
      writeFileSync(confPath, httpConf, { mode: 0o644 });
      if (isDebian) {
        const enabledPath = `/etc/apache2/sites-enabled/homeserver-panel.conf`;
        try { symlinkSync(confPath, enabledPath); } catch { /* existe déjà */ }
      }
      await exec('apache2ctl', ['-t'], 10_000).catch(async () => exec('httpd', ['-t'], 10_000));
      await exec('systemctl', ['reload', isDebian ? 'apache2' : 'httpd'], 30_000);
      // 2. Certificat Let's Encrypt (validation via le vhost 80)
      if (!(await tryExec('certbot', ['--version']))) {
        if (isDebian) await aptUpdate();
        await pkgInstall(isDebian ? 'debian' : 'rhel', ['certbot', 'python3-certbot-apache']);
      }
      const args =['certonly', '--apache', '-d', req.domain, '--non-interactive', '--agree-tos', '-m', req.email, '--keep-until-expiring'];
      await exec('certbot', args, 300_000);
      // 3. Vhost 443 proxy vers le panel + redirection 80 -> 443
      const sslConf = [
        `<VirtualHost *:80>`,
        `  ServerName ${req.domain}`,
        `  Redirect permanent / https://${req.domain}/`,
        `</VirtualHost>`,
        `<VirtualHost *:443>`,
        `  ServerName ${req.domain}`,
        `  ProxyPreserveHost On`,
        `  ProxyPass / http://127.0.0.1:${port}/`,
        `  ProxyPassReverse / http://127.0.0.1:${port}/`,
        `  SSLEngine on`,
        `  SSLCertificateFile /etc/letsencrypt/live/${req.domain}/fullchain.pem`,
        `  SSLCertificateKeyFile /etc/letsencrypt/live/${req.domain}/privkey.pem`,
        `</VirtualHost>`,
      ].join('\n') + '\n';
      writeFileSync(confPath, sslConf, { mode: 0o644 });
      await exec('apache2ctl', ['-t'], 10_000).catch(async () => exec('httpd', ['-t'], 10_000));
      await exec('systemctl', ['reload', isDebian ? 'apache2' : 'httpd'], 30_000);
      // 4. Bascule .env : écoute locale + cookies Secure + domaine mémorisé
      const envFile = findPanelEnv();
      if (envFile) {
        let env = readPanelEnv(envFile);
        const setVar = (key: string, value: string): void => {
          const re = new RegExp(`^${key}=.*$`, 'm');
          if (re.test(env)) env = env.replace(re, `${key}=${value}`);
          else env += `${env.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
        };
        setVar('HS_HOST', '127.0.0.1');
        setVar('HS_SECURE_COOKIES', 'true');
        setVar('HS_FORCE_HTTPS', 'true');
        setVar('HS_PANEL_DOMAIN', req.domain);
        writePanelEnv(envFile, env);
        await exec('systemctl', ['restart', 'homeserver'], 30_000);
      }
      return { domain: req.domain, https: true, url: `https://${req.domain}` };
    }
    case 'panel_https_revert': {
      const isDebian = existsSync('/etc/apache2');
      const confPath = isDebian ? '/etc/apache2/sites-available/homeserver-panel.conf' : '/etc/httpd/conf.d/homeserver-panel.conf';
      if (existsSync(confPath)) {
        unlinkSync(confPath);
        if (isDebian) {
          const enabledPath = '/etc/apache2/sites-enabled/homeserver-panel.conf';
          if (existsSync(enabledPath)) unlinkSync(enabledPath);
        }
        await exec('systemctl', ['reload', isDebian ? 'apache2' : 'httpd'], 30_000).catch(() => undefined);
      }
      const envFile = findPanelEnv();
      if (envFile) {
        let env = readPanelEnv(envFile);
        env = env.replace(/^HS_PANEL_DOMAIN=.*\n?/m, '').replace(/^HS_FORCE_HTTPS=.*\n?/m, '');
        env = env.replace(/^HS_HOST=.*$/m, 'HS_HOST=0.0.0.0').replace(/^HS_SECURE_COOKIES=.*$/m, 'HS_SECURE_COOKIES=false');
        writePanelEnv(envFile, env);
        await exec('systemctl', ['restart', 'homeserver'], 30_000);
      }
      return { https: false };
    }
    case 'ssh_hardening_status': {
      const dropinPath = '/etc/ssh/sshd_config.d/50-homeserver-hardening.conf';
      let passwordAuth = true;
      let rootLogin = true;
      try {
        const stdout = await exec('sshd', ['-T'], 5000);
        const pw = /^passwordauthentication\s+(\S+)/m.exec(stdout);
        const root = /^permitrootlogin\s+(\S+)/m.exec(stdout);
        passwordAuth = pw ? pw[1] === 'yes' : true;
        rootLogin = root ? root[1] !== 'no' : true;
      } catch { /* sshd -T indisponible — laisser les défauts */ }
      // Parcourir les authorized_keys des utilisateurs avec home répertorié
      const users: Array<{ username: string; keyCount: number; fingerprints: string[] }> = [];
      const passwd = readFileSync('/etc/passwd', 'utf8');
      for (const line of passwd.split('\n')) {
        const [name, , , , , home, shell] = line.split(':');
        if (!name || !home || home.startsWith('/var/lib/homeserver')) continue;
        if (shell === '/usr/sbin/nologin' || shell === '/bin/false') continue;
        const akPath = `${home}/.ssh/authorized_keys`;
        if (!existsSync(akPath)) continue;
        try {
          const content = readFileSync(akPath, 'utf8');
          const keyLines = content.split('\n').filter((l) => l.trim().startsWith('ssh-') || l.trim().startsWith('ecdsa-'));
          const fingerprints: string[] = [];
          for (const kl of keyLines) {
            try {
              const stdout = await exec('ssh-keygen', ['-lf', akPath], 3000);
              for (const fl of stdout.split('\n')) {
                const m = /((?:sha256|MD5):[A-Za-z0-9+=\/]+)/.exec(fl);
                if (m?.[1] && !fingerprints.includes(m[1])) fingerprints.push(m[1]);
              }
            } catch { /* ssh-keygen absent */ }
          }
          users.push({ username: name, keyCount: keyLines.length, fingerprints: fingerprints.slice(0, 5) });
        } catch { /* non lisible */ }
      }
      return {
        passwordAuth,
        rootLogin,
        dropinApplied: existsSync(dropinPath),
        users,
      } as SshHardeningStatusResult;
    }
    case 'ssh_hardening_apply': {
      const dropinDir = '/etc/ssh/sshd_config.d';
      const dropinPath = `${dropinDir}/50-homeserver-hardening.conf`;
      // Garde-fou : au moins une clé enregistrée pour un utilisateur avec shell
      let totalKeys = 0;
      const passwd = readFileSync('/etc/passwd', 'utf8');
      for (const line of passwd.split('\n')) {
        const [name, , , , , home, shell] = line.split(':');
        if (!name || !home || shell === '/usr/sbin/nologin' || shell === '/bin/false') continue;
        const akPath = `${home}/.ssh/authorized_keys`;
        if (!existsSync(akPath)) continue;
        try {
          const content = readFileSync(akPath, 'utf8');
          totalKeys += content.split('\n').filter((l) => l.trim().startsWith('ssh-') || l.trim().startsWith('ecdsa-')).length;
        } catch { /* non lisible */ }
      }
      if (totalKeys === 0) {
        throw new Error('Aucune clé SSH enregistrée — ajoute une clé avant de couper les mots de passe (sinon tu perds l\'accès distant).');
      }
      mkdirSync(dropinDir, { recursive: true });
      writeFileSync(dropinPath, [
        '# Généré par Homeserver — durcissement SSH',
        '# La console physique/VPS reste accessible par mot de passe.',
        'PasswordAuthentication no',
        'PermitRootLogin no',
        'KbdInteractiveAuthentication no',
        '',
      ].join('\n'), { mode: 0o644 });
      // Vérifier la syntaxe avant de recharger
      try {
        await exec('sshd', ['-t'], 5000);
      } catch (e) {
        // Rollback immédiat : le drop-in casse la config — ne jamais laisser sshd cassé
        try { unlinkSync(dropinPath); } catch { /* tant pis */ }
        throw new Error(`Test sshd -t échoué — drop-in annulé : ${(e as Error).message}`);
      }
      try {
        await exec('systemctl', ['reload', 'sshd'], 5000);
      } catch {
        try { await exec('systemctl', ['reload', 'ssh'], 5000); } catch { /* nom d'unité variable */ }
      }
      log(`SSH durci (drop-in ${dropinPath}, ${totalKeys} clé(s) enregistrée(s))`);
      return { applied: true, passwordAuth: false, rootLogin: false, keysCount: totalKeys } as SshHardeningApplyResult & { keysCount: number };
    }
    case 'ssh_hardening_revert': {
      const dropinPath = '/etc/ssh/sshd_config.d/50-homeserver-hardening.conf';
      if (!existsSync(dropinPath)) {
        return { applied: false, passwordAuth: true, rootLogin: true, reason: 'aucun drop-in à supprimer' } as SshHardeningApplyResult;
      }
      unlinkSync(dropinPath);
      try {
        await exec('sshd', ['-t'], 5000);
      } catch (e) {
        // Ne devrait pas arriver (on ne fait que supprimer), mais on vérifie
        throw new Error(`Test sshd -t échoué après suppression : ${(e as Error).message}`);
      }
      try {
        await exec('systemctl', ['reload', 'sshd'], 5000);
      } catch {
        try { await exec('systemctl', ['reload', 'ssh'], 5000); } catch { /* nom d'unité variable */ }
      }
      log('SSH durcissement retiré (mots de passe réactivés)');
      return { applied: false, passwordAuth: true, rootLogin: true } as SshHardeningApplyResult;
    }
    case 'fail2ban_setup': {
      await f2bInstall(family);
      // Réinstallation : la configuration faite depuis le panel est conservée
      const cfg = f2bReadConfig() ?? f2bDefaultConfig(req.web);
      await exec('systemctl', ['enable', 'fail2ban'], 15_000);
      try {
        await f2bApply(cfg, true);
      } catch (e) {
        // Dernier recours : sshd seul, pour ne jamais laisser le serveur sans protection SSH
        log(`fail2ban : configuration complète refusée (${(e as Error).message}), repli sur sshd seul`);
        const fallback = { ...cfg, jails: cfg.jails.map((j) => ({ ...j, enabled: j.name === 'sshd' })) };
        await f2bApply(fallback, true);
      }
      const active = await f2bServiceActive();
      const jails = active ? await f2bActiveJails().catch(() => []) : [];
      log(`fail2ban configuré (jails : ${jails.join(', ') || 'aucune'})`);
      return { installed: true, active, jailFile: F2B_CONF, jails };
    }
    case 'fail2ban_status': {
      const result: Fail2banStatusResult = { installed: false, active: false, enabled: false, jails: [] };
      if (!f2bInstalled()) return result;
      result.installed = true;
      result.enabled = ((await tryExec('systemctl', ['is-enabled', 'fail2ban'])) ?? '').trim() === 'enabled';
      result.active = await f2bServiceActive();
      if (!result.active) return result;
      try {
        for (const j of await f2bActiveJails()) {
          try {
            result.jails.push({ name: j, ...(await f2bJailStatus(j)) });
          } catch { /* jail illisible */ }
        }
      } catch { /* status illisible (serveur en cours de démarrage) */ }
      return result;
    }
    case 'fail2ban_config_get': {
      const installed = f2bInstalled();
      return {
        installed,
        config: f2bReadConfig() ?? f2bDefaultConfig(),
        available: f2bAvailableJails(),
        file: F2B_CONF,
      } satisfies Fail2banConfigResult;
    }
    case 'fail2ban_config_set': {
      if (!f2bInstalled()) throw new Error('fail2ban n\'est pas installé');
      const available = f2bAvailableJails();
      const missing = req.config.jails.filter((j) => j.enabled && !available.includes(j.name)).map((j) => j.name);
      if (missing.length > 0) throw new Error(`Jail(s) sans journal sur ce serveur : ${missing.join(', ')}`);
      const cfg = f2bNormalize(req.config);
      await f2bApply(cfg);
      log(`fail2ban : configuration mise à jour (${cfg.jails.filter((j) => j.enabled).map((j) => j.name).join(', ')})`);
      return { applied: true, config: cfg, active: await f2bServiceActive() };
    }
    case 'fail2ban_ban': {
      if (!(await f2bServiceActive())) throw new Error('fail2ban est arrêté');
      if (!(await f2bActiveJails()).includes(req.jail)) throw new Error(`Jail ${req.jail} inactive`);
      // banip passe outre ignoreip : la liste blanche est vérifiée ici
      const whitelist = new BlockList();
      for (const entry of ['127.0.0.0/8', '::1', ...f2bSelfAddresses(), ...(f2bReadConfig()?.ignoreip ?? [])]) {
        const [ip = '', prefix] = entry.split('/');
        const type = isIP(ip) === 6 ? 'ipv6' : 'ipv4';
        if (prefix === undefined) whitelist.addAddress(ip, type);
        else whitelist.addSubnet(ip, Number(prefix), type);
      }
      if (whitelist.check(req.ip, isIP(req.ip) === 6 ? 'ipv6' : 'ipv4')) {
        throw new Error(`${req.ip} est dans la liste blanche : retire-la d'abord pour la bannir`);
      }
      try {
        // l'action de ban (nft, firewall-cmd) peut prendre plusieurs secondes
        await exec('fail2ban-client', ['set', req.jail, 'banip', req.ip], 60_000);
      } catch (e) {
        throw new Error(`Bannissement impossible : ${cmdError(e)}`);
      }
      const banned = (await f2bJailStatus(req.jail)).bannedIps.includes(req.ip);
      if (!banned) throw new Error(`${req.ip} n'a pas été bannie`);
      log(`fail2ban : ${req.ip} bannie manuellement (${req.jail})`);
      return { banned: true, ip: req.ip, jail: req.jail };
    }
    case 'fail2ban_unban': {
      if (!(await f2bServiceActive())) throw new Error('fail2ban est arrêté');
      const jails = req.jail ? [req.jail] : await f2bActiveJails();
      const unbanned: string[] = [];
      for (const j of jails) {
        try {
          if (!(await f2bJailStatus(j)).bannedIps.includes(req.ip)) continue;
          await exec('fail2ban-client', ['set', j, 'unbanip', req.ip], 60_000);
          unbanned.push(j);
        } catch { /* jail inactive */ }
      }
      if (unbanned.length > 0) log(`fail2ban : ${req.ip} débannie (${unbanned.join(', ')})`);
      return { unbanned, ip: req.ip };
    }
    case 'unattended_upgrades_enable': {
      try {
        await aptUpdate();
        await apt(['install', '-y', 'unattended-upgrades']);
      } catch (e) {
        throw new Error(`Installation impossible : ${(e as Error).message}`);
      }
      try {
        await exec('systemctl', ['enable', '--now', 'unattended-upgrades.timer'], 15_000);
      } catch { /* timer peut déjà tourner */ }
      log('unattended-upgrades activé');
      return { enabled: true };
    }
    case 'systemctl': {
      if (req.verb === 'status') {
        const [active, enabled] = await Promise.all([
          tryExec('systemctl', ['is-active', req.unit]),
          tryExec('systemctl', ['is-enabled', req.unit]),
        ]);
        return { unit: req.unit, active: (active ?? '').trim() === 'active', enabled: (enabled ?? '').trim() === 'enabled' };
      }
      await exec('systemctl', [req.verb, req.unit]);
      return { unit: req.unit, verb: req.verb };
    }
    default:
      throw Object.assign(new Error('Action inconnue'), { code: 'UNKNOWN_ACTION' });
  }
}

const server = createServer((socket) => {
  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    // Requête démesurée (ou jamais terminée par un saut de ligne) : connexion coupée
    if (buf.length > MAX_REQUEST_BYTES) {
      log('connexion coupée : requête trop volumineuse');
      socket.destroy();
      return;
    }
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      let raw: unknown;
      try { raw = JSON.parse(line); } catch { continue; }
      handleRequest(raw)
        .then((data) => {
          socket.write(JSON.stringify({ ok: true, data, contract_version: CONTRACT_VERSION }) + '\n');
        })
        .catch((err: unknown) => {
          const e = err as Error & { code?: string };
          const code = e.code === 'VALIDATION' || e.code === 'EXEC' || e.code === 'UNKNOWN_ACTION' ? e.code : 'EXEC';
          log(`ERROR ${e.message}`);
          socket.write(JSON.stringify({ ok: false, error: e.message, code, contract_version: CONTRACT_VERSION }) + '\n');
        });
    }
  });
  socket.on('error', () => {});
});

server.maxConnections = MAX_CONNECTIONS;
migrateBindZones();
{
  // Serveur de mail activé par une version précédente : mis à niveau sans attendre une action
  // Dans cet ordre : la mise à niveau du mail réécrit aussi la configuration de fail2ban
  void f2bRepairOnStart()
    .catch((e: Error) => log(`fail2ban : mise à niveau impossible : ${e.message}`))
    .finally(() => upgradeMailOnStart(mailDeps(detectFamily())));
}
mkdirSync(SOCKET_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
server.listen(SOCKET_PATH, () => {
  chmodSync(SOCKET_PATH, 0o660);
  log(`helper à l'écoute sur ${SOCKET_PATH}`);
});
