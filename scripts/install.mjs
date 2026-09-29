import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const rl = readline.createInterface({ input: stdin, output: stdout });

const BANNER = `
\x1b[1;36m                                                     
 ▄▄    ▄▄                                  ▄▄▄▄                                                      
 ██    ██                                ▄█▀▀▀▀█                                                     
 ██    ██   ▄████▄   ████▄██▄   ▄████▄   ██▄        ▄████▄    ██▄████  ██▄  ▄██   ▄████▄    ██▄████ 
 ████████  ██▀  ▀██  ██ ██ ██  ██▄▄▄▄██   ▀████▄   ██▄▄▄▄██   ██▀       ██  ██   ██▄▄▄▄██   ██▀     
 ██    ██  ██    ██  ██ ██ ██  ██▀▀▀▀▀▀       ▀██  ██▀▀▀▀▀▀   ██        ▀█▄▄█▀   ██▀▀▀▀▀▀   ██      
 ██    ██  ▀██▄▄██▀  ██ ██ ██  ▀██▄▄▄▄█  █▄▄▄▄▄█▀  ▀██▄▄▄▄█   ██         ████    ▀██▄▄▄▄█   ██      
 ▀▀    ▀▀    ▀▀▀▀    ▀▀ ▀▀ ▀▀    ▀▀▀▀▀    ▀▀▀▀▀      ▀▀▀▀▀    ▀▀          ▀▀       ▀▀▀▀▀    ▀▀      
                                                     
\x1b[0m\x1b[2m        Panel de gestion de serveur web/hébergement\x1b[0m\n`;

function log(msg) { console.log(`\x1b[36m→\x1b[0m ${msg}`); }
function ok(msg) { console.log(`\x1b[32m✓\x1b[0m ${msg}`); }
function die(msg) { console.error(`\x1b[31m✗ ${msg}\x1b[0m`); process.exit(1); }

const sh = (cmd) => execSync(cmd, { stdio: 'pipe' }).toString().trim();
const has = (bin) => {
  try { execSync(`command -v ${bin}`, { stdio: 'pipe' }); return true; } catch { return false; }
};

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

function randomSuffix(len = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  const buf = execSync(`tr -dc a-z < /dev/urandom | head -c ${len}`, { stdio: 'pipe' });
  for (const ch of buf.toString('utf8')) if (chars.includes(ch)) out += ch;
  return out || 'fallback' + Math.random().toString(36).slice(2, 2 + len);
}

async function main() {
  console.log(BANNER);
  if (process.getuid?.() !== 0) die("L'installation requiert root (réessaie avec sudo).");

  const distro = detectDistro();
  log(`Distro détectée : ${distro.pretty} (famille: ${distro.family})`);
  if (distro.family === 'unknown') die('Distro non supportée (Debian/Ubuntu ou Fedora/RHEL requis).');

  const pkgManager = distro.family === 'debian' ? 'apt-get' : 'dnf';

  log('Vérification de Node.js...');
  if (!has('node')) die('Node.js >= 20 requis. Installe-le puis relance.');
  ok(`Node ${sh('node --version')}`);

  const user = `hs-${randomSuffix()}`;
  log(`Création de l'utilisateur système ${user} (nologin, sans mot de passe)...`);
  execSync(`useradd -r -M -s /usr/sbin/nologin -d /nonexistent ${user}`, { stdio: 'pipe' });
  ok(`Utilisateur ${user} créé`);

  const adminUser = (await rl.question('Utilisateur admin du panel [admin]: ')) || 'admin';
  const adminPassword = sh('openssl rand -base64 12');
  const jwtSecret = sh('openssl rand -hex 32');
  const port = (await rl.question('Port de l\'API [3000]: ')) || '3000';

  const modules = ['system', 'apache'];
  log(`Modules activés : ${modules.join(', ')}`);

  const env = [
    `HS_PORT=${port}`,
    `HS_JWT_SECRET=${jwtSecret}`,
    `HS_ADMIN_USER=${adminUser}`,
    `HS_ADMIN_PASSWORD=${adminPassword}`,
    `HS_USER=${user}`,
    `HS_MODULES=${modules.join(',')}`,
  ].join('\n') + '\n';
  writeFileSync('.env', env);
  ok('.env généré');

  log('Installation des dépendances npm...');
  execSync('npm install --omit=dev', { stdio: 'inherit' });
  execSync('npm run build', { stdio: 'inherit' });
  ok('Build terminé');

  log('Installation des paquets système...');
  if (distro.family === 'debian') {
    execSync('apt-get update', { stdio: 'inherit' });
    execSync('apt-get install -y apache2', { stdio: 'inherit' });
  } else {
    execSync('dnf install -y httpd', { stdio: 'inherit' });
  }
  ok('Paquets installés');

  const serviceUnit = `[Unit]
Description=Homeserver panel
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${process.cwd()}
ExecStart=${process.execPath} ${process.cwd()}/server/dist/index.js
Restart=on-failure
EnvironmentFile=${process.cwd()}/.env

[Install]
WantedBy=multi-user.target
`;
  writeFileSync('/etc/systemd/system/homeserver.service', serviceUnit);
  execSync('systemctl daemon-reload', { stdio: 'inherit' });
  execSync('systemctl enable --now homeserver', { stdio: 'inherit' });
  ok('Service systemd installé et démarré');

  console.log(`\n\x1b[32mInstallation terminée !\x1b[0m`);
  console.log(`  Admin      : ${adminUser} / ${adminPassword}`);
  console.log(`  API        : http://localhost:${port}/api`);
  console.log(`  Utilisateur système : ${user} (accès admin : sudo -u ${user} <cmd>)\n`);
  rl.close();
}

main().catch((err) => die(err.message));
