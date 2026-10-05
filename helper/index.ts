import { createServer } from 'node:net';
import { mkdirSync, existsSync, statSync, unlinkSync, readdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, chownSync, chmodSync } from 'node:fs';
import { userInfo } from 'node:os';

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
import { validateRequest, CONTRACT_VERSION } from '../server/src/core/privileged/contract.js';

const SOCKET_PATH = process.env.HS_HELPER_SOCKET ?? '/run/homeserver/helper.sock';
const LOG_FILE = process.env.HS_HELPER_LOG ?? '/var/log/homeserver/helper.log';

function ensureNodeOnPath(): string | null {
  const candidates = [
    '/var/lib/homeserver/.nvm/versions/node',
  ];
  for (const versionsDir of candidates) {
    if (!existsSync(versionsDir)) continue;
    const versions = readdirSync(versionsDir)
      .map((v) => v.replace(/^v/, ''))
      .sort((a, b) => Number(b.split('.')[0]) - Number(a.split('.')[0]));
    if (versions.length === 0) continue;
    const binDir = `${versionsDir}/v${versions[0]}/bin`;
    if (!existsSync(`${binDir}/node`)) continue;
    // rendre les parents traversables pour que les autres utilisateurs puissent executer
    for (const dir of ['/var/lib/homeserver', '/var/lib/homeserver/.nvm', versionsDir, `${versionsDir}/v${versions[0]}`, binDir]) {
      try { chmodSync(dir, 0o755); } catch { /* deja ok */ }
    }
    for (const bin of ['node', 'npm', 'npx', 'corepack']) {
      const target = `${binDir}/${bin}`;
      const link = `/usr/local/bin/${bin}`;
      if (existsSync(target) && !existsSync(link)) {
        try { symlinkSync(target, link); } catch { /* deja lie */ }
      }
    }
    return '/usr/local/bin/node';
  }
  return null;
}

const run = promisify(execFile);

function log(line: string): void {
  mkdirSync(LOG_FILE.replace(/\/[^/]+$/, ''), { recursive: true });
  import('node:fs').then((fs) => fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`));
}

async function exec(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await run(cmd, args, { timeout: 120_000 });
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

async function ensureSuryRepo(family: 'debian' | 'rhel'): Promise<void> {
  if (family === 'debian') {
    await exec('apt-get', ['update']);
    const sury = await exec('apt-cache', ['policy', 'php8.4-fpm']).catch(() => '');
    if (!sury.includes('Candidate:')) {
      await exec('apt-get', ['install', '-y', 'apt-transport-https', 'ca-certificates', 'curl', 'gnupg']);
      await exec('bash', ['-c', 'curl -fsSL https://packages.sury.org/php/apt.gpg | gpg --dearmor -o /usr/share/keyrings/deb.sury.org-php.gpg']);
      await exec('bash', ['-c', 'echo "deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ $(lsb_release -sc) main" > /etc/apt/sources.list.d/php.list']);
      await exec('apt-get', ['update']);
    }
  } else {
    const remi = await exec('dnf', ['repolist']).catch(() => '');
    if (!remi.includes('remi')) {
      await exec('dnf', ['install', '-y', 'epel-release']);
      await exec('dnf', ['install', '-y', 'https://rpms.remirepo.net/enterprise/remi-release-$(rpm -E %rhel).rpm']).catch(async () => {
        await exec('dnf', ['install', '-y', 'remi-release']);
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
  const versions = ['8.1', '8.2', '8.3', '8.4'];
  const pkgFor = (v: string) => family === 'debian' ? `php${v}-fpm` : `php${v.replace('.', '')}-php-fpm`;
  const result = await Promise.all(versions.map(async (v) => ({
    version: v,
    package: pkgFor(v),
    installed: await isPackageInstalled(family, pkgFor(v)),
    available: family === 'rhel' ? true : await exec('apt-cache', ['policy', pkgFor(v)]).then((o) => o.includes('Candidate:')).catch(() => false),
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

async function handleRequest(raw: unknown): Promise<unknown> {
  const req = validateRequest(raw);
  if (!req) throw Object.assign(new Error('Requête invalide'), { code: 'VALIDATION' });
  const family = detectFamily();
  switch (req.action) {
    case 'echo':
      return { echo: true, family };
    case 'install_packages':
      await ensureSuryRepo(family).catch(() => {});
      if (family === 'debian') await exec('apt-get', ['install', '-y', ...req.packages]);
      else await exec('dnf', ['install', '-y', ...req.packages]);
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
      const nodeBin = ensureNodeOnPath() ?? '/usr/bin/env node';
      const unit = `/etc/systemd/system/${req.name}.service`;
      if (existsSync(unit)) throw new Error(`L'application ${req.name} existe déjà`);
      const home = homeOf(req.user) ?? `/home/${req.user}`;
      const appDir = `${home}/nodeApps/${req.name.replace(/^hs-app-/, '')}`;
      if (!existsSync(appDir)) {
        mkdirSync(appDir, { recursive: true, mode: 0o755 });
        const uid = req.user === 'root' ? 0 : uidOf(req.user);
        if (uid !== undefined) chownSync(appDir, uid, -1);
      }
      const entry = `${appDir}/${req.entry}`;
      let entryCreated = false;
      if (!existsSync(entry)) {
        const entryDir = entry.replace(/\/[^/]+$/, '');
        if (!existsSync(entryDir)) {
          mkdirSync(entryDir, { recursive: true, mode: 0o755 });
          const uid = req.user === 'root' ? 0 : uidOf(req.user);
          if (uid !== undefined) chownSync(entryDir, uid, -1);
        }
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
        writeFileSync(entry, skeleton, { mode: 0o644 });
        const uid = req.user === 'root' ? 0 : uidOf(req.user);
        if (uid !== undefined) chownSync(entry, uid, -1);
        entryCreated = true;
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
        await run('apt-get', ['-y', 'upgrade'], { timeout: 1_800_000 });
        return { family, upgraded: true };
      }
      await run('dnf', ['-y', 'upgrade'], { timeout: 1_800_000 });
      return { family, upgraded: true };
    }
    case 'user_create': {
      if (req.home === '/dev/null') {
        // compat: home par défaut /home/<user>
      }
      const home = req.home === '/dev/null' ? `/home/${req.username}` : req.home;
      mkdirSync(home.replace(/\/[^/]+$/, ''), { recursive: true });
      if (!existsSync(home)) mkdirSync(home, { mode: 0o755 });
      ensureNodeOnPath();
      await exec('groupadd', ['-f', 'homeserver-web']);
      await exec('groupadd', ['-f', 'homeserver-sftp']);
      const group = req.shell === '/bin/bash' ? 'homeserver-web' : 'homeserver-sftp';
      const useraddArgs = ['-r', '-d', home, '-s', req.shell, '-G', group, req.username];
      try {
        await exec('useradd', useraddArgs);
      } catch (err) {
        const e = err as { message: string };
        if (!e.message.includes('already exists')) throw err;
      }
      try {
        execFileSync('chpasswd', [`${req.username}:${req.password}`], { stdio: ['pipe', 'ignore', 'ignore'], timeout: 30_000 });
      } catch (err) {
        const e = err as { message: string };
        throw new Error(`Définition du mot de passe échouée: ${e.message}`);
      }
      if (existsSync(home)) {
        chownSync(home, -1, -1);
        try { chmodSync(home, 0o755); } catch { /* no-op */ }
        const uid = uidOf(req.username);
        const gid = gidOf(req.username);
        if (uid !== undefined && gid !== undefined) {
          for (const sub of ['www', 'nodeApps']) {
            const subPath = `${home}/${sub}`;
            if (!existsSync(subPath)) mkdirSync(subPath, { mode: 0o755 });
            chownSync(subPath, uid, gid);
          }
        }
      }
      return { username: req.username, created: true };
    }
    case 'user_set_password': {
      execFileSync('chpasswd', [`${req.username}:${req.password}`], { stdio: ['pipe', 'ignore', 'ignore'], timeout: 30_000 });
      return { username: req.username, updated: true };
    }
    case 'user_delete': {
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
      if (req.removeHome && home !== undefined && home.startsWith('/home/') && home !== '/home') {
        if (existsSync(home)) {
          rmSync(home, { recursive: true, force: true });
        }
        homeRemoved = !existsSync(home);
      }
      return { username: req.username, deleted: true, homeRemoved };
    }
    case 'user_ssh_keys_list': {
      const home = homeOf(req.username);
      const file = `${home}/.ssh/authorized_keys`;
      if (!existsSync(file)) return { username: req.username, keys: [] as string[] };
      const keys = readFileSync(file, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
      return { username: req.username, keys };
    }
    case 'user_ssh_keys_add': {
      const home = homeOf(req.username);
      if (!home || !existsSync(home)) throw new Error(`Répertoire personnel introuvable: ${home}`);
      const sshDir = `${home}/.ssh`;
      const file = `${sshDir}/authorized_keys`;
      if (!existsSync(sshDir)) mkdirSync(sshDir, { mode: 0o700 });
      const uid = uidOf(req.username);
      const gid = gidOf(req.username);
      if (uid !== undefined && gid !== undefined) {
        chownSync(sshDir, uid, gid);
        chmodSync(sshDir, 0o700);
      }
      const existing = existsSync(file) ? readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l.length > 0) : [];
      if (existing.some((k) => k === req.key)) throw new Error('Cette clé est déjà installée');
      existing.push(req.key);
      writeFileSync(file, `${existing.join('\n')}\n`, { mode: 0o600 });
      if (uid !== undefined && gid !== undefined) {
        chownSync(file, uid, gid);
        chmodSync(file, 0o600);
      }
      return { username: req.username, added: true, count: existing.length };
    }
    case 'user_ssh_keys_remove': {
      const home = homeOf(req.username);
      const file = `${home}/.ssh/authorized_keys`;
      if (!existsSync(file)) throw new Error('Aucune clé installée');
      const existing = readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      if (req.index >= existing.length) throw new Error('Clé introuvable');
      existing.splice(req.index, 1);
      if (existing.length === 0) {
        rmSync(file);
      } else {
        writeFileSync(file, `${existing.join('\n')}\n`, { mode: 0o600 });
        const uid = uidOf(req.username);
        const gid = gidOf(req.username);
        if (uid !== undefined && gid !== undefined) chownSync(file, uid, gid);
      }
      return { username: req.username, removed: true, count: existing.length };
    }
    case 'sftp_configure': {
      const confPath = '/etc/ssh/sshd_config.d/homeserver-sftp.conf';
      const dir = '/etc/ssh/sshd_config.d';
      const content = [
        '# managed by homeserver — SFTP chrooté pour les utilisateurs SFTP uniquement',
        'Match Group homeserver-sftp',
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
    case 'fs_read': {
      if (!existsSync(req.path)) throw new Error('Fichier introuvable');
      const st = statSync(req.path);
      if (st.size > 5_000_000) throw new Error('Fichier trop volumineux');
      return { content: readFileSync(req.path, 'utf8') };
    }
    case 'fs_write': {
      const st = statSync(req.path, { throwIfNoEntry: false });
      if (st && !st.isFile()) throw new Error('Cible non supportée');
      mkdirSync(req.path.replace(/\/[^/]+$/, ''), { recursive: true });
      writeFileSync(req.path, req.content, { mode: 0o644 });
      return { written: req.path, bytes: Buffer.byteLength(req.content) };
    }
    case 'fs_list': {
      if (!existsSync(req.path)) return { entries: [] };
      const entries = readdirSync(req.path).map((name) => {
        const full = `${req.path}/${name}`;
        const st = statSync(full, { throwIfNoEntry: false });
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
      });
      return { entries };
    }
    case 'fs_mkdir': {
      mkdirSync(req.path, { recursive: true, mode: 0o755 });
      return { created: req.path };
    }
    case 'fs_delete': {
      if (!existsSync(req.path)) throw new Error('Cible introuvable');
      rmSync(req.path, { recursive: true, force: true });
      return { removed: req.path };
    }
    case 'fs_chown': {
      if (!existsSync(req.path)) throw new Error('Cible introuvable');
      await exec('chown', [req.recursive ? '-R' : '', req.owner + ':' + req.group, req.path].filter(Boolean));
      return { path: req.path, owner: req.owner };
    }
    case 'packages_remove':
      if (family === 'debian') await exec('apt-get', ['remove', '-y', ...req.packages]);
      else await exec('dnf', ['remove', '-y', ...req.packages]);
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
      switch (req.op) {
        case 'create_db':
          await sql(`CREATE DATABASE IF NOT EXISTS \`${req.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
          return { database: req.database, created: true };
        case 'drop_db':
          await sql(`DROP DATABASE IF EXISTS \`${req.database}\`;`);
          return { database: req.database, dropped: true };
        case 'create_user': {
          await sql(`CREATE USER IF NOT EXISTS '${req.username}'@'%' IDENTIFIED BY '${req.password}';`);
          await sql(`CREATE USER IF NOT EXISTS '${req.username}'@'localhost' IDENTIFIED BY '${req.password}';`);
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
          await sql(`ALTER USER '${req.username}'@'%' IDENTIFIED BY '${req.password}';`);
          await sql(`ALTER USER '${req.username}'@'localhost' IDENTIFIED BY '${req.password}';`);
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
        }
        return { active: true };
      }
      const ufw = await tryExec('ufw', ['--version']);
      if (ufw !== null) await exec('ufw', ['disable']);
      else await exec('systemctl', ['stop', 'firewalld']);
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
      mkdirSync('/var/backups/homeserver', { recursive: true });
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const file = `homeserver-${req.site}-${stamp}.tar.gz`;
      const target = `/var/backups/homeserver/${file}`;
      await exec('tar', ['-czf', target, '-C', '/home/' + req.site.split('/')[0], 'www/' + req.site.split('/').slice(1).join('/')]);
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
      await exec('tar', ['-xzf', target, '-C', `/home/${req.site.split('/')[0]}`]);
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

mkdirSync(SOCKET_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
server.listen(SOCKET_PATH, () => {
  chmodSync(SOCKET_PATH, 0o660);
  log(`helper à l'écoute sur ${SOCKET_PATH}`);
});
