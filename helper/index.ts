import { createServer } from 'node:net';
import { mkdirSync, existsSync, statSync, unlinkSync, readdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateRequest, CONTRACT_VERSION } from '../server/src/core/privileged/contract.js';

const SOCKET_PATH = process.env.HS_HELPER_SOCKET ?? '/run/homeserver/helper.sock';
const LOG_FILE = process.env.HS_HELPER_LOG ?? '/var/log/homeserver/helper.log';

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

async function detectFamily(): Promise<'debian' | 'rhel'> {
  try {
    await exec('command', ['-v', 'apt-get']);
    return 'debian';
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
  const family = await detectFamily();
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
      const paths = siteEnablePaths(req.site);
      if (!paths) throw new Error('Layout Apache inconnu');
      if (!existsSync(paths.available)) throw new Error(`Site introuvable: ${req.site}`);
      if (req.enable) {
        if (!existsSync(paths.enabled)) symlinkSync(paths.available, paths.enabled);
      } else {
        if (existsSync(paths.enabled)) unlinkSync(paths.enabled);
      }
      return { site: req.site, enabled: req.enable };
    }
    case 'pending_updates':
      return handlePendingUpdates(family);
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
  log(`helper à l'écoute sur ${SOCKET_PATH}`);
});
