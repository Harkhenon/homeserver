import { existsSync, writeFileSync, readFileSync, renameSync, chmodSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { createServer, connect } from 'node:net';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// Mode non interactif : --yes côté install.sh, ou stdin sans terminal.
// Chaque question peut aussi être pré-remplie par une variable HS_* (voir install.sh --help).
const NONINTERACTIVE = process.env.HS_NONINTERACTIVE === '1';
const rl = NONINTERACTIVE ? null : readline.createInterface({ input: stdin, output: stdout });

function log(msg) { console.log(`\x1b[36m→\x1b[0m ${msg}`); }
function ok(msg) { console.log(`\x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg) { console.log(`\x1b[33m! ${msg}\x1b[0m`); }
function die(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  if (process.env.HS_INSTALL_LOG) console.error(`\x1b[2m  journal : ${process.env.HS_INSTALL_LOG}\x1b[0m`);
  process.exit(1);
}

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
      socket.end();
      try {
        const res = JSON.parse(buf.slice(0, idx));
        res.ok ? resolve(res.data) : reject(new Error(`[${res.code}] ${res.error}`));
      } catch (e) {
        reject(new Error(`Réponse du helper illisible (${e.message})`));
      }
    });
    socket.on('error', reject);
    socket.setTimeout(timeoutMs, () => { socket.destroy(); reject(new Error('Timeout du helper')); });
  });
}

/**
 * Pose une question (ou lit la variable d'environnement `envKey`), valide la réponse.
 * validate(valeur) renvoie la valeur normalisée, ou null si invalide.
 */
async function ask(question, { def = '', envKey, validate = (v) => v, hint = 'valeur invalide' } = {}) {
  const fromEnv = envKey ? process.env[envKey] : undefined;
  if (fromEnv !== undefined && fromEnv !== '') {
    const v = validate(fromEnv.trim());
    if (v === null) die(`${envKey}=${fromEnv} : ${hint}`);
    return v;
  }
  if (NONINTERACTIVE) {
    const v = validate(def);
    if (v === null) die(`${question} : aucune valeur par défaut valide (${envKey ?? 'non interactif'})`);
    return v;
  }
  for (;;) {
    const answer = ((await rl.question(`${question}${def !== '' ? ` [${def}]` : ''}: `)).trim()) || def;
    const v = validate(answer);
    if (v !== null) return v;
    warn(hint);
  }
}

const yesNo = (v) => {
  const s = String(v).toLowerCase();
  if (['', 'o', 'oui', 'y', 'yes', '1', 'true'].includes(s)) return true;
  if (['n', 'non', 'no', '0', 'false'].includes(s)) return false;
  return null;
};

function portFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
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
  if (['fedora', 'rhel', 'rocky', 'almalinux', 'centos'].some((d) => id.includes(d) || like.includes(d))) return { family: 'rhel', pretty };
  return { family: 'unknown', pretty };
}

/** .env existant → Map ordonnée (les clés inconnues de l'installeur sont conservées). */
function parseEnv(content) {
  const map = new Map();
  for (const line of (content ?? '').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

async function main() {
  console.log('\x1b[1m=== Homeserver — Configuration (hs-utilisateur) ===\x1b[0m\n');

  const installDir = process.env.HS_INSTALL_DIR ?? process.cwd();
  if (!process.env.HS_USER) die('HS_USER manquant : lance via scripts/install.sh.');
  const user = process.env.HS_USER;

  const distro = detectDistro();
  ok(`Distro détectée : ${distro.pretty} (famille: ${distro.family})`);

  log('Test du helper privilégié...');
  let echo = null;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      echo = await callHelper({ action: 'echo' }, 5_000);
      break;
    } catch (e) {
      if (attempt === 15) die(`Helper inaccessible (${e.message}) — journalctl -u hs-helper -n 50`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  ok(`Helper opérationnel (famille: ${echo.family})`);
  const family = echo.family;

  const envPath = `${installDir}/.env`;
  const existing = parseEnv(existsSync(envPath) ? readFileSync(envPath, 'utf8') : null);
  const reinstall = existing.has('HS_JWT_SECRET');
  if (reinstall) ok('.env existant détecté — configuration conservée, seules les valeurs manquantes sont demandées');

  // --- Questions (les valeurs déjà configurées ne sont pas redemandées) ---
  const adminUser = existing.get('HS_ADMIN_USER') || await ask('Utilisateur admin du panel', {
    def: 'admin', envKey: 'HS_ADMIN_USER',
    validate: (v) => (/^[a-zA-Z][a-zA-Z0-9._-]{1,31}$/.test(v) ? v : null),
    hint: '2 à 32 caractères : lettres, chiffres, . _ - (commence par une lettre)',
  });

  let port = existing.get('HS_PORT');
  if (!port) {
    port = await ask("Port de l'API", {
      def: '3000', envKey: 'HS_PORT',
      validate: (v) => (/^\d+$/.test(v) && Number(v) >= 1024 && Number(v) <= 65535 ? v : null),
      hint: 'port entre 1024 et 65535',
    });
    if (!(await portFree(Number(port)))) die(`Le port ${port} est déjà utilisé sur cette machine (ss -ltnp | grep :${port}).`);
  }

  const host = existing.get('HS_HOST') || await ask("Interface d'écoute [1=Toutes (0.0.0.0), 2=Local (127.0.0.1, derrière reverse-proxy TLS)]", {
    def: '1', envKey: 'HS_HOST',
    validate: (v) => (['1', '0.0.0.0'].includes(v) ? '0.0.0.0' : ['2', '127.0.0.1'].includes(v) ? '127.0.0.1' : null),
    hint: 'réponds 1 ou 2',
  });

  const existingWeb = (existing.get('HS_MODULES') ?? '').split(',').find((m) => m === 'apache' || m === 'nginx') ?? null;
  const webServer = existingWeb ?? (family === 'rhel' ? 'apache' : await ask('Serveur web [1=Apache, 2=Nginx]', {
    def: '1', envKey: 'HS_WEB_SERVER',
    validate: (v) => (['1', 'apache', 'apache2'].includes(v.toLowerCase()) ? 'apache' : ['2', 'nginx'].includes(v.toLowerCase()) ? 'nginx' : null),
    hint: 'réponds 1 (Apache) ou 2 (Nginx)',
  }));

  let panelDomain = existing.get('HS_PANEL_DOMAIN') || null;
  let letsencryptEmail = null;
  if (!panelDomain) {
    if (webServer !== 'apache') {
      if (process.env.HS_PANEL_DOMAIN) warn('HTTPS automatique du panel disponible uniquement avec Apache — HS_PANEL_DOMAIN ignoré');
    } else {
      panelDomain = await ask("Domaine du panel pour HTTPS Let's Encrypt (vide = HTTP sur IP)", {
        def: '', envKey: 'HS_PANEL_DOMAIN',
        validate: (v) => (v === '' ? '' : /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(v) ? v.toLowerCase() : null),
        hint: 'domaine invalide (ex: panel.exemple.fr) — laisse vide pour HTTP',
      }) || null;
      if (panelDomain) {
        letsencryptEmail = await ask(`Email pour le certificat de ${panelDomain}`, {
          def: '', envKey: 'HS_LETSENCRYPT_EMAIL',
          validate: (v) => (v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null),
          hint: 'email invalide',
        });
        if (!letsencryptEmail) {
          warn('Pas d\'email — HTTPS ignoré (activable plus tard dans Paramètres → Accès réseau)');
          panelDomain = null;
        }
      }
    }
  }

  const extras = await ask('Installer les paquets recommandés (MariaDB, Bind9, Certbot, Cron) [oui/non]', {
    def: 'oui', envKey: 'HS_INSTALL_EXTRAS', validate: yesNo, hint: 'réponds oui ou non',
  });

  // --- .env : fusion avec l'existant (HS_PANEL_DOMAIN, HS_FORCE_HTTPS, CORS… conservés) ---
  // Mot de passe admin : hashé (scrypt, même format que server/src/auth/crypto.ts) dans le
  // store d'auth de hs-*, jamais écrit en clair dans le .env. Un ancien HS_ADMIN_PASSWORD
  // est migré puis retiré.
  const authStore = existing.get('HS_AUTH_STORE') || '/var/lib/homeserver/auth.json';
  let authState = null;
  try { authState = JSON.parse(readFileSync(authStore, 'utf8')); } catch { /* absent ou illisible */ }
  const passwordMigrated = typeof authState?.passwordHash === 'string' && authState.passwordHash.startsWith('scrypt$');
  let adminPassword = null;
  if (!passwordMigrated) {
    adminPassword = existing.get('HS_ADMIN_PASSWORD') || randomBytes(12).toString('base64url');
    const salt = randomBytes(16);
    const key = scryptSync(adminPassword, salt, 64, { N: 16384, r: 8, p: 1 });
    const state = {
      ...(authState ?? {}),
      adminUser: authState?.adminUser || adminUser,
      passwordHash: `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`,
      recentAttempts: Array.isArray(authState?.recentAttempts) ? authState.recentAttempts : [],
    };
    writeFileSync(`${authStore}.tmp`, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    chmodSync(`${authStore}.tmp`, 0o600);
    renameSync(`${authStore}.tmp`, authStore);
    ok(`Mot de passe admin hashé dans ${authStore}`);
  }
  const env = new Map(existing);
  const set = (k, v) => env.set(k, v);
  set('HS_PORT', port);
  set('HS_HOST', host);
  set('HS_JWT_SECRET', existing.get('HS_JWT_SECRET') || randomBytes(32).toString('hex'));
  set('HS_ADMIN_USER', adminUser);
  env.delete('HS_ADMIN_PASSWORD');
  set('HS_USER', user);
  set('HS_MODULES', existing.get('HS_MODULES') || `system,${webServer},bind9,users,files,php,ssl,mariadb,mail,cron,backups,firewall,monitor,node`);
  set('HS_AUTH_STORE', authStore);
  set('HS_SECURE_COOKIES', existing.get('HS_SECURE_COOKIES') || (host === '127.0.0.1' ? 'true' : 'false'));
  const content = [
    '# Généré par scripts/install.sh — modifiable aussi depuis Paramètres → Accès réseau',
    '# Auth : HS_AUTH_STORE contient le hash scrypt + secret TOTP (chmod 600)',
    ...[...env].map(([k, v]) => `${k}=${v}`),
  ].join('\n') + '\n';
  // Écriture en place : le .env appartient à hs-* mais vit dans un répertoire root
  // (pas de fichier temporaire possible à côté)
  writeFileSync(envPath, content, { mode: 0o600 });
  chmodSync(envPath, 0o600);
  ok(`.env ${reinstall ? 'mis à jour' : 'généré'} (${envPath}, chmod 600)`);

  // --- PHP ---
  log('Découverte des versions de PHP disponibles...');
  let phpChoice = null;
  try {
    const discovered = await callHelper({ action: 'discover', kind: 'php' });
    const available = discovered.versions.filter((v) => v.available);
    if (available.length > 0) {
      const newest = available.length;
      const labels = available.map((v, i) => `${i + 1}) PHP ${v.version}`).join('  ');
      phpChoice = await ask(`Versions de PHP disponibles — ${labels}  0) aucune`, {
        def: String(newest), envKey: 'HS_PHP_VERSION',
        validate: (v) => {
          if (['0', 'none', 'aucune'].includes(v)) return 'none';
          if (v === 'latest') return available[newest - 1].version;
          const byVersion = available.find((a) => a.version === v);
          if (byVersion) return byVersion.version;
          const idx = /^\d+$/.test(v) ? Number(v) - 1 : -1;
          return available[idx]?.version ?? null;
        },
        hint: `choisis un numéro entre 0 et ${newest}`,
      });
      if (phpChoice === 'none') phpChoice = null;
      ok(`PHP sélectionné : ${phpChoice ?? 'aucun'}`);
    } else {
      ok('Aucune version de PHP disponible pour le moment (installable plus tard depuis le panel)');
    }
  } catch (e) {
    warn(`Découverte PHP ignorée: ${e.message}`);
  }

  // --- Paquets système (via helper) ---
  // Serveur web obligatoire ; PHP et extras en best-effort (rattrapables depuis le panel).
  const webUnit = family === 'debian' ? (webServer === 'nginx' ? 'nginx' : 'apache2') : (webServer === 'nginx' ? 'nginx' : 'httpd');
  const certbotPlugin = webServer === 'nginx' ? 'python3-certbot-nginx' : 'python3-certbot-apache';
  const extraPkgs = family === 'debian'
    ? ['mariadb-server', 'bind9', 'certbot', certbotPlugin, 'cron']
    : ['mariadb-server', 'bind', 'certbot', certbotPlugin, 'cronie'];
  const phpPkg = phpChoice ? (family === 'debian' ? `php${phpChoice}-fpm` : `php${phpChoice.replace('.', '')}-php-fpm`) : null;

  const installGroup = async (label, packages, required) => {
    log(`Installation : ${label} (${packages.join(', ')})...`);
    try {
      await callHelper({ action: 'install_packages', packages }, 2_400_000);
      ok(`${label} installé`);
      return true;
    } catch (e) {
      const msg = `${label} : installation échouée — ${e.message.split('\n').slice(-3).join(' ')}`;
      if (required) die(msg);
      warn(`${msg} (installable plus tard depuis le panel)`);
      return false;
    }
  };
  await installGroup(`serveur web ${webUnit}`, [webUnit], true);
  if (phpPkg) await installGroup(`PHP ${phpChoice}`, [phpPkg], false);
  const extrasOk = extras ? await installGroup('paquets recommandés', extraPkgs, false) : false;
  // RHEL/Fedora : contrairement à Debian, un paquet installé n'active pas son service
  if (extrasOk && family === 'rhel') {
    for (const unit of ['mariadb', 'named']) {
      try {
        await callHelper({ action: 'systemctl', unit, verb: 'enable' });
        await callHelper({ action: 'systemctl', unit, verb: 'start' });
        ok(`Service ${unit} activé`);
      } catch (e) {
        warn(`Service ${unit} non démarré (${e.message})`);
      }
    }
  }
  if (family === 'debian') await installGroup('unattended-upgrades (correctifs sécurité auto)', ['unattended-upgrades'], false);

  log('Activation du service web (via helper)...');
  try {
    await callHelper({ action: 'systemctl', unit: webUnit, verb: 'enable' });
    await callHelper({ action: 'systemctl', unit: webUnit, verb: 'start' });
    ok(`Service web activé (${webUnit})`);
  } catch (e) {
    warn(`Service web non démarré (${e.message}) — un autre serveur occupe peut-être le port 80`);
  }

  // Après le serveur web : ses journaux doivent exister pour que la jail web démarre
  log('Installation et activation de fail2ban (jails sshd + web)...');
  try {
    const res = await callHelper({ action: 'fail2ban_setup', web: webServer }, 2_400_000);
    if (res.active) ok(`fail2ban actif (jails : ${res.jails.join(', ') || 'aucune'})`);
    else warn('fail2ban installé mais inactif — à vérifier dans Pare-feu → Fail2ban');
  } catch (e) {
    warn(`fail2ban non installé (${e.message.split('\n').slice(-3).join(' ')}) — le serveur n'est pas protégé contre le brute-force SSH. Réessaie depuis Pare-feu → Fail2ban`);
  }

  // Service e-mail : à la demande (Postfix, Dovecot, OpenDKIM), activable aussi depuis le panel
  const mailHostname = process.env.HS_INSTALL_MAIL === 'yes' ? process.env.HS_MAIL_HOSTNAME : null;
  if (process.env.HS_INSTALL_MAIL === 'yes' && !mailHostname) {
    warn('HS_INSTALL_MAIL=yes sans HS_MAIL_HOSTNAME : service e-mail ignoré (activable depuis le panel)');
  } else if (mailHostname) {
    log(`Activation du service e-mail (${mailHostname})...`);
    try {
      await callHelper({ action: 'mail_setup', hostname: mailHostname.trim().toLowerCase() }, 2_400_000);
      ok('Service e-mail activé');
    } catch (e) {
      warn(`Service e-mail non activé (${e.message.split('\n')[0]}) — réessaie depuis le panel, page E-mails`);
    }
  }

  log('Démarrage du panel...');
  await callHelper({ action: 'systemctl', unit: 'homeserver', verb: 'enable' });
  await callHelper({ action: 'systemctl', unit: 'homeserver', verb: 'restart' });
  ok('Panel démarré et activé au boot');

  if (panelDomain && letsencryptEmail) {
    log(`Passage du panel en HTTPS (${panelDomain}) — émission du certificat Let's Encrypt...`);
    try {
      const res = await callHelper({ action: 'panel_https_setup', domain: panelDomain, email: letsencryptEmail });
      ok(`Panel en HTTPS : ${res.url}`);
    } catch (e) {
      warn(`HTTPS ignoré (${e.message}) — vérifie que le domaine pointe vers ce serveur. Activable plus tard dans Paramètres → Accès réseau`);
    }
  }

  console.log(`\n\x1b[32mConfiguration terminée.\x1b[0m`);
  if (adminPassword === null) {
    console.log(`  Admin      : ${adminUser} / (mot de passe inchangé — celui défini dans le panel)`);
  } else {
    console.log(`  Admin      : ${adminUser} / ${adminPassword}`);
  }
  console.log(`  Utilisateur système : ${user} (accès admin: sudo -u ${user} <cmd>)`);
  rl?.close();
}

main().catch((err) => die(err.message));
