import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { connect } from 'node:net';

const rl = readline.createInterface({ input: stdin, output: stdout });

function log(msg) { console.log(`\x1b[36m→\x1b[0m ${msg}`); }
function ok(msg) { console.log(`\x1b[32m✓\x1b[0m ${msg}`); }
function die(msg) { console.error(`\x1b[31m✗ ${msg}\x1b[0m`); process.exit(1); }

const sh = (cmd) => execSync(cmd, { stdio: 'pipe' }).toString().trim();

const SOCKET = process.env.HS_HELPER_SOCKET ?? '/run/homeserver/helper.sock';

async function callHelper(request, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const socket = connect(SOCKET);
    let buf = '';
    socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const idx = buf.indexOf('\n');
      if (idx < 0) return;
      const res = JSON.parse(buf.slice(0, idx));
      socket.end();
      res.ok ? resolve(res.data) : reject(new Error(`[${res.code}] ${res.error}`));
    });
    socket.on('error', reject);
    socket.setTimeout(timeoutMs, () => { socket.destroy(); reject(new Error('Timeout du helper')); });
  });
}

function detectDistro() {
  if (!existsSync('/etc/os-release')) return { family: 'unknown', pretty: 'Unknown' };
  const c = readFileSync('/etc/os-release', 'utf8');
  const get = (k) => c.match(new RegExp(`^${k}=["']?(.+?)["']?$`, 'm'))?.[1] ?? '';
  const id = get('ID').toLowerCase();
  const like = get('ID_LIKE').toLowerCase();
  const pretty = get('PRETTY_NAME') || 'Unknown';
  if (id.includes('debian') || id.includes('ubuntu') || like.includes('debian')) return { family: 'debian', pretty };
  if (['fedora', 'rhel', 'rocky', 'almalinux', 'centos'].some((d) => id.includes(d))) return { family: 'rhel', pretty };
  return { family: 'unknown', pretty };
}

async function main() {
  console.log('\x1b[1m=== Homeserver — Installation (hs-utilisateur) ===\x1b[0m\n');

  const installDir = process.env.HS_INSTALL_DIR ?? process.cwd();
  if (!process.env.HS_USER) die('HS_USER manquant : lance via scripts/install.sh.');
  const user = process.env.HS_USER;

  const distro = detectDistro();
  ok(`Distro détectée : ${distro.pretty} (famille: ${distro.family})`);

  log('Test du helper privilégié...');
  const echo = await callHelper({ action: 'echo' }).catch((e) => die(`Helper inaccessible (${e.message})`));
  ok(`Helper opérationnel (famille: ${echo.family})`);

  const adminUser = (await rl.question('Utilisateur admin du panel [admin]: ')) || 'admin';
  const adminPassword = sh('openssl rand -base64 12');
  const jwtSecret = sh('openssl rand -hex 32');
  const port = (await rl.question("Port de l'API [3000]: ")) || '3000';

  const env = [
    `HS_PORT=${port}`,
    `HS_JWT_SECRET=${jwtSecret}`,
    `HS_ADMIN_USER=${adminUser}`,
    `HS_ADMIN_PASSWORD=${adminPassword}`,
    `HS_USER=${user}`,
    `HS_MODULES=system,apache`,
  ].join('\n') + '\n';
  writeFileSync(`${installDir}/.env`, env);
  ok(`.env généré (${installDir}/.env)`);

  log('Découverte des versions de PHP disponibles...');
  let phpChoice = 'aucune';
  try {
    const discovered = await callHelper({ action: 'discover', kind: 'php' });
    const available = discovered.versions.filter((v) => v.available);
    if (available.length > 0) {
      const labels = available.map((v, i) => `${i + 1}) PHP ${v.version}`).join('  ');
      const answer = await rl.question(`Versions de PHP disponibles — ${labels} [1]: `);
      const idx = Math.max(0, Math.min(available.length - 1, parseInt(answer || '1', 10) - 1));
      phpChoice = available[idx]?.version ?? 'aucune';
      ok(`PHP sélectionné : ${phpChoice}`);
    } else {
      ok('Aucune version de PHP disponible pour le moment');
    }
  } catch (e) {
    console.log(`\x1b[33m! Découverte PHP ignorée: ${e.message}\x1b[0m`);
  }

  log('Installation des paquets système (via helper)...');
  const family = echo.family;
  const packages = family === 'debian'
    ? ['apache2', ...(phpChoice !== 'aucune' ? [`php${phpChoice}-fpm`] : [])]
    : ['httpd', ...(phpChoice !== 'aucune' ? [`php${phpChoice.replace('.', '')}-php-fpm`] : [])];
  await callHelper({ action: 'install_packages', packages });
  ok(`Paquets installés: ${packages.join(', ')}`);

  log('Activation du service web (via helper)...');
  await callHelper({ action: 'systemctl', unit: family === 'debian' ? 'apache2' : 'httpd', verb: 'enable' });
  await callHelper({ action: 'systemctl', unit: family === 'debian' ? 'apache2' : 'httpd', verb: 'start' });
  ok('Service web activé');

  log('Démarrage du panel...');
  execSync('systemctl restart homeserver 2>/dev/null || true', { stdio: 'inherit' });
  ok('Panel démarré');

  console.log(`\n\x1b[32mInstallation terminée !\x1b[0m`);
  console.log(`  Admin      : ${adminUser} / ${adminPassword}`);
  console.log(`  API        : http://localhost:${port}/api`);
  console.log(`  Utilisateur système : ${user} (accès admin: sudo -u ${user} <cmd>)\n`);
  rl.close();
}

main().catch((err) => die(err.message));
