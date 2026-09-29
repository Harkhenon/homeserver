import { createServer } from 'node:net';
import { mkdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateRequest, CONTRACT_VERSION } from '../server/src/core/privileged/contract.js';

const SOCKET_PATH = process.env.HS_HELPER_SOCKET ?? '/run/homeserver/helper.sock';
const LOG_FILE = process.env.HS_HELPER_LOG ?? '/var/log/homeserver/helper.log';
const run = promisify(execFile);

function log(line: string): void {
  mkdirSync(LOG_FILE.replace(/\/[^/]+$/, ''), { recursive: true });
  // appendFile importé dynamiquement pour garder le logger simple
  import('node:fs').then((fs) => fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`));
}

async function exec(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await run(cmd, args, { timeout: 120_000 });
  return stdout;
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
      const fs = await import('node:fs');
      mkdirSync(req.path.replace(/\/[^/]+$/, ''), { recursive: true });
      fs.writeFileSync(req.path, req.content, { mode: 0o644 });
      return { written: req.path };
    }
    case 'read_file': {
      const fs = await import('node:fs');
      if (!existsSync(req.path)) throw new Error('Fichier introuvable');
      return { content: fs.readFileSync(req.path, 'utf8') };
    }
    case 'systemctl':
      await exec('systemctl', [req.verb, req.unit]);
      return { unit: req.unit, verb: req.verb };
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
          log(`OK ${JSON.stringify(raw)}`);
          socket.write(JSON.stringify({ ok: true, data, contract_version: CONTRACT_VERSION }) + '\n');
        })
        .catch((err: { message: string; code?: string }) => {
          log(`ERR ${JSON.stringify(raw)}: ${err.message}`);
          const code = err.code === 'VALIDATION' || err.code === 'UNKNOWN_ACTION' ? err.code : 'EXEC';
          socket.write(JSON.stringify({ ok: false, error: err.message, code, contract_version: CONTRACT_VERSION }) + '\n');
        });
    }
  });
});

mkdirSync(SOCKET_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
server.listen(SOCKET_PATH, () => {
  const fs = import('node:fs');
  fs.then((f) => f.chmodSync(SOCKET_PATH, 0o660));
  console.log(`hs-helper à l'écoute sur ${SOCKET_PATH}`);
});

process.on('SIGTERM', () => {
  if (existsSync(SOCKET_PATH) && (statSync(SOCKET_PATH).isSocket?.() ?? true)) unlinkSync(SOCKET_PATH);
  server.close(() => process.exit(0));
});
