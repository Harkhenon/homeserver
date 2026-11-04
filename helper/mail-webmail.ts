// Webmail Roundcube (rôle : root).
// Pool PHP-FPM et utilisateur dédiés, HTTPS sur le nom d'hôte du serveur de mail, aucun fichier des paquets modifié :
// notre configuration est chargée en plus de la leur par RCUBE_CONFIG_PATH.
import { chmodSync, chownSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { connect } from 'node:net';
import { errText, exec, execInput, serviceActive, tryExec } from './mail-util.js';

export interface WebmailState {
  enabled: boolean;
  /** Clé de chiffrement des sessions Roundcube : stable, sinon les utilisateurs sont déconnectés. */
  desKey: string;
  /** Jeton partagé avec la route locale de changement de mot de passe. */
  secret: string;
  panelPort: number;
}

interface WebmailDeps {
  family: 'debian' | 'rhel';
  pkgInstall(packages: string[]): Promise<void>;
  pkgRefresh(): Promise<void>;
  log(line: string): void;
}

interface TlsPaths {
  cert: string;
  key: string;
}

const USER = 'homeserver-webmail';
const DATA_DIR = '/var/lib/homeserver-webmail';
const CONF_DIR = '/etc/homeserver-webmail';
const CONF_FILE = `${CONF_DIR}/config.inc.php`;
const SITE = 'homeserver-mail-webmail.conf';
const POOL_FILE = 'homeserver-webmail.conf';
const MARKER = '# Généré par Homeserver';

/** Présence de notre configuration : sert aussi à fail2ban pour savoir si sa jail a un sens. */
export function webmailConfigured(): boolean {
  return existsSync(CONF_FILE);
}

function layout(family: 'debian' | 'rhel'): { pkgConf: string; root: string; install: string; group: string } {
  return family === 'debian'
    ? { pkgConf: '/etc/roundcube', root: '/var/lib/roundcube/public_html', install: '/usr/share/roundcube', group: 'www-data' }
    : { pkgConf: '/etc/roundcubemail', root: '/usr/share/roundcubemail/public_html', install: '/usr/share/roundcubemail', group: 'apache' };
}

/**
 * Roundcube charge chaque chemin de RCUBE_CONFIG_PATH, puis toujours son répertoire de configuration.
 * Sur Debian, ce dernier est /etc/roundcube, dont la base vide écraserait la nôtre : ROUNDCUBE_CONFIG_DIR
 * nous place en dernier. Fedora ignore cette variable, et n'a pas de config.inc.php à lui.
 */
function configEnv(family: 'debian' | 'rhel'): Record<string, string> {
  const { pkgConf } = layout(family);
  return family === 'debian'
    ? { RCUBE_CONFIG_PATH: pkgConf, ROUNDCUBE_CONFIG_DIR: CONF_DIR }
    : { RCUBE_CONFIG_PATH: `${pkgConf}:${CONF_DIR}` };
}

let availability: boolean | null = null;

/** Le résultat ne change pas d'une requête à l'autre, et `dnf info` est lent : une seule fois par démarrage. */
export async function webmailAvailable(family: 'debian' | 'rhel'): Promise<boolean> {
  if (availability !== null) return availability;
  if (family === 'debian') {
    const candidate = ((await tryExec('apt-cache', ['policy', 'roundcube-core'], 20_000)) ?? '').match(/Candidate:\s*(\S+)/)?.[1];
    availability = candidate !== undefined && candidate !== '(none)';
  } else {
    availability = (await tryExec('dnf', ['-q', 'info', 'roundcubemail'], 60_000)) !== null;
  }
  return availability;
}

export function newWebmailState(panelPort: number): WebmailState {
  return { enabled: false, desKey: randomBytes(12).toString('hex'), secret: randomBytes(32).toString('hex'), panelPort };
}

export function secretMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Vérifie un mot de passe auprès de Dovecot, par son IMAP local. Pas de doveadm : le mot de passe
 * y passerait en argument, visible dans la liste des processus.
 */
export function verifyMailPassword(address: string, password: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = connect(143, '127.0.0.1');
    let buffer = '';
    const finish = (fn: () => void): void => { socket.destroy(); fn(); };
    socket.setTimeout(20_000, () => finish(() => reject(new Error('Dovecot ne répond pas'))));
    socket.on('error', (e) => finish(() => reject(e)));
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\r\n');
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf('\r\n');
        if (line.startsWith('* OK')) socket.write('a AUTHENTICATE PLAIN\r\n');
        else if (line.startsWith('+')) socket.write(`${Buffer.from(`\0${address}\0${password}`).toString('base64')}\r\n`);
        else if (line.startsWith('a OK')) finish(() => resolve(true));
        else if (line.startsWith('a NO') || line.startsWith('a BAD')) finish(() => resolve(false));
      }
    });
  });
}

interface FpmTarget {
  /** Fonctions PHP à masquer pour ce pool, voir fpmTarget. */
  disabled: string;
  binary: string;
  unit: string;
  poolDir: string;
  socket: string;
  php: string;
}

/** La version PHP de la distribution : celle des paquets dont Roundcube dépend, quelles que soient les autres installées. */
async function fpmTarget(family: 'debian' | 'rhel'): Promise<FpmTarget> {
  if (family === 'rhel') return { disabled: '', binary: 'php-fpm', unit: 'php-fpm', poolDir: '/etc/php-fpm.d', socket: '/run/php-fpm/homeserver-webmail.sock', php: 'php' };
  const depends = await exec('dpkg-query', ['-W', '-f=${Depends}', 'php-fpm'], 15_000);
  const version = depends.match(/php(\d+\.\d+)-fpm/)?.[1];
  if (!version) throw new Error('Version de PHP-FPM introuvable');
  // PHP 8.5 fournit array_first et array_last, que Roundcube 1.6 déclare aussi : erreur fatale à chaque page
  // (Ubuntu 26.04). Masquées pour ce seul pool, Roundcube utilise alors les siennes ; le paquet reste intact.
  const [major = 0, minor = 0] = version.split('.').map(Number);
  const disabled = major > 8 || (major === 8 && minor >= 5) ? 'array_first,array_last' : '';
  return { disabled, binary: `php-fpm${version}`, unit: `php${version}-fpm`, poolDir: `/etc/php/${version}/fpm/pool.d`, socket: '/run/php/homeserver-webmail.sock', php: `php${version}` };
}

async function installPackages(deps: WebmailDeps): Promise<void> {
  await deps.pkgRefresh();
  if (deps.family === 'debian') {
    // Base SQLite gérée par le panel : pas de dbconfig, et aucune question posée pendant l'installation
    await execInput('debconf-set-selections', [], [
      'roundcube-core roundcube/dbconfig-install boolean false',
      'roundcube-core roundcube/reconfigure-webserver multiselect',
      '',
    ].join('\n'));
    // php-fpm d'abord dans la liste : sinon le méta-paquet « php » tirerait Apache et mod_php
    await deps.pkgInstall(['php-fpm', 'roundcube-core', 'roundcube-sqlite3', 'roundcube-plugins']);
  } else {
    await deps.pkgInstall(['roundcubemail', 'php-fpm', 'php-cli', 'php-pdo']);
  }
}

async function ensureUser(group: string): Promise<{ uid: number; gid: number }> {
  if ((await tryExec('id', ['-u', USER], 5_000)) === null) {
    await exec('useradd', ['--system', '--user-group', '--no-create-home', '--home-dir', DATA_DIR, '--shell', '/usr/sbin/nologin', USER], 30_000);
  }
  // Les fichiers de configuration des paquets sont lisibles par ce groupe seulement
  await exec('usermod', ['-a', '-G', group, USER], 30_000);
  const uid = Number((await exec('id', ['-u', USER], 5_000)).trim());
  const gid = Number((await exec('id', ['-g', USER], 5_000)).trim());
  return { uid, gid };
}

function renderConfig(state: WebmailState): string {
  return `<?php
${MARKER} — ne pas éditer (régénéré par le panel).
$config['db_dsnw'] = 'sqlite:///${DATA_DIR}/roundcube.db?mode=0640';
$config['temp_dir'] = '${DATA_DIR}/temp/';
$config['des_key'] = '${state.desKey}';
$config['enable_installer'] = false;
$config['product_name'] = 'Webmail';
$config['language'] = 'fr_FR';
$config['skin'] = 'elastic';
$config['plugins'] = ['password', 'archive', 'zipdownload', 'markasjunk'];

// Boucle locale : Dovecot n'exige pas TLS sur 127.0.0.1, Postfix l'exige sur le port d'envoi
$config['imap_host'] = '127.0.0.1:143';
$config['smtp_host'] = 'tls://127.0.0.1:587';
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';
$config['smtp_conn_options'] = ['ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true]];

$config['ip_check'] = true;
$config['log_driver'] = 'syslog';
$config['syslog_id'] = 'roundcube';
$config['log_logins'] = true;

$config['password_driver'] = 'httpapi';
$config['password_confirm_current'] = true;
$config['password_minimum_length'] = 12;
$config['password_httpapi_url'] = 'http://127.0.0.1:${state.panelPort}/api/webmail/password';
$config['password_httpapi_method'] = 'POST';
$config['password_httpapi_var_user'] = 'user';
$config['password_httpapi_var_curpass'] = 'current';
$config['password_httpapi_var_newpass'] = 'password';
$config['password_httpapi_expect'] = '/"ok":true/';
$config['password_http_client'] = ['headers' => ['X-Homeserver-Webmail' => '${state.secret}'], 'timeout' => 60];
`;
}

function renderPool(family: 'debian' | 'rhel', socket: string, webUser: string, disabled: string): string {
  // « ; » : un « # » rendrait tout PHP-FPM impossible à démarrer
  return `; Généré par Homeserver — ne pas éditer (régénéré par le panel).
[homeserver-webmail]
user = ${USER}
group = ${USER}
listen = ${socket}
listen.owner = ${webUser}
listen.group = ${webUser}
listen.mode = 0660
pm = ondemand
pm.max_children = 10
pm.process_idle_timeout = 60s
clear_env = yes
${Object.entries(configEnv(family)).map(([k, v]) => `env[${k}] = ${v}`).join('\n')}
env[PATH] = /usr/local/bin:/usr/bin:/bin
php_admin_value[upload_max_filesize] = 25M
php_admin_value[post_max_size] = 30M
php_admin_value[memory_limit] = 256M
php_admin_flag[log_errors] = on
${disabled ? `php_admin_value[disable_functions] = ${disabled}\n` : ''}`;
}

function renderApache(hostname: string, root: string, socket: string, tls: TlsPaths): string {
  return `${MARKER}
<VirtualHost *:80>
  ServerName ${hostname}
  RedirectMatch 301 "^/(?!\\.well-known/acme-challenge/)(.*)$" "https://${hostname}/$1"
</VirtualHost>
<VirtualHost *:443>
  ServerName ${hostname}
  DocumentRoot ${root}
  SSLEngine on
  SSLCertificateFile ${tls.cert}
  SSLCertificateKeyFile ${tls.key}
  <Directory ${root}>
    Options FollowSymLinks
    AllowOverride None
    Require all granted
    DirectoryIndex index.php
  </Directory>
  # L'installeur de Roundcube afficherait des informations sur la configuration
  <Files "installer.php">
    Require all denied
  </Files>
  <FilesMatch "\\.php$">
    SetHandler "proxy:unix:${socket}|fcgi://localhost/"
  </FilesMatch>
</VirtualHost>
`;
}

function renderNginx(hostname: string, root: string, socket: string, tls: TlsPaths): string {
  return `${MARKER}
server {
  listen 80;
  listen [::]:80;
  server_name ${hostname};
  location / {
    return 301 https://${hostname}$request_uri;
  }
}
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${hostname};
  root ${root};
  index index.php;
  client_max_body_size 30m;
  ssl_certificate ${tls.cert};
  ssl_certificate_key ${tls.key};
  # L'installeur de Roundcube afficherait des informations sur la configuration
  location = /installer.php {
    return 404;
  }
  location / {
    try_files $uri $uri/ /index.php$is_args$args;
  }
  # static.php/… : Roundcube sert ses ressources avec un chemin après le script
  location ~ ^(.+?\\.php)(/.*)?$ {
    try_files $1 =404;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$1;
    fastcgi_param PATH_INFO $2;
    fastcgi_pass unix:${socket};
  }
}
`;
}

interface WebServer {
  kind: 'apache' | 'nginx';
  unit: string;
  available: string;
  enabled: string | null;
  test: [string, string[]];
  user: string;
}

/** Serveur web actif, ou null : le webmail n'a alors nulle part où être servi. */
export async function detectWebServer(family: 'debian' | 'rhel'): Promise<WebServer | null> {
  const debianLayout = family === 'debian';
  if ((await serviceActive('apache2')) || (await serviceActive('httpd'))) {
    const apacheDebian = existsSync('/etc/apache2/sites-available');
    return {
      kind: 'apache',
      unit: apacheDebian ? 'apache2' : 'httpd',
      available: apacheDebian ? `/etc/apache2/sites-available/${SITE}` : `/etc/httpd/conf.d/${SITE}`,
      enabled: apacheDebian ? `/etc/apache2/sites-enabled/${SITE}` : null,
      test: [apacheDebian ? 'apache2ctl' : 'httpd', ['-t']],
      user: debianLayout ? 'www-data' : 'apache',
    };
  }
  if (await serviceActive('nginx')) {
    const nginxDebian = existsSync('/etc/nginx/sites-available');
    return {
      kind: 'nginx',
      unit: 'nginx',
      available: nginxDebian ? `/etc/nginx/sites-available/${SITE}` : `/etc/nginx/conf.d/${SITE}`,
      enabled: nginxDebian ? `/etc/nginx/sites-enabled/${SITE}` : null,
      test: ['nginx', ['-t']],
      user: debianLayout ? 'www-data' : 'nginx',
    };
  }
  return null;
}

async function ensureSelinux(deps: WebmailDeps): Promise<void> {
  if ((await tryExec('selinuxenabled', [], 5_000)) === null) return;
  const rule = `${DATA_DIR}(/.*)?`;
  if ((await tryExec('semanage', ['fcontext', '-a', '-t', 'httpd_sys_rw_content_t', rule], 60_000)) === null
    && (await tryExec('semanage', ['fcontext', '-m', '-t', 'httpd_sys_rw_content_t', rule], 60_000)) === null) {
    deps.log('webmail : règle SELinux non posée (semanage indisponible ?)');
  }
  await tryExec('restorecon', ['-R', DATA_DIR], 60_000);
  // PHP doit joindre IMAP, le port d'envoi et la route du panel
  await tryExec('setsebool', ['-P', 'httpd_can_network_connect', '1'], 120_000);
}

async function initDatabase(family: 'debian' | 'rhel', fpm: FpmTarget, deps: WebmailDeps): Promise<void> {
  const { install } = layout(family);
  const db = `${DATA_DIR}/roundcube.db`;
  if (!existsSync(db)) {
    // Debian ne fournit pas bin/initdb.sh : même schéma, appliqué directement
    const code = `$d = new PDO('sqlite:${db}'); $d->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $d->exec(file_get_contents('${install}/SQL/sqlite.initial.sql'));`;
    await exec('runuser', ['-u', USER, '--', fpm.php, '-r', code], 60_000);
    chmodSync(db, 0o640);
  }
  await updateSchema(family, fpm, deps);
}

/** Une mise à jour du paquet peut changer le schéma ; le script est sans effet quand il est à jour. */
async function updateSchema(family: 'debian' | 'rhel', fpm: FpmTarget, deps: WebmailDeps): Promise<void> {
  const { install } = layout(family);
  try {
    const env = Object.entries(configEnv(family)).map(([k, v]) => `${k}=${v}`);
    const defines = fpm.disabled ? ['-d', `disable_functions=${fpm.disabled}`] : [];
    await exec('runuser', ['-u', USER, '--', 'env', ...env, fpm.php, ...defines, `${install}/bin/updatedb.sh`, '--package=roundcube', `--dir=${install}/SQL/sqlite`], 120_000);
  } catch (e) {
    deps.log(`webmail : mise à niveau du schéma impossible : ${errText(e)}`);
  }
}

async function openWebPorts(deps: WebmailDeps): Promise<void> {
  const ufw = await tryExec('ufw', ['status'], 15_000);
  if (ufw?.startsWith('Status: active')) {
    for (const p of ['80', '443']) await exec('ufw', ['allow', `${p}/tcp`], 30_000);
    deps.log('webmail : ports 80 et 443 ouverts dans ufw');
    return;
  }
  if ((await tryExec('firewall-cmd', ['--state'], 15_000)) !== null) {
    for (const p of ['80', '443']) await exec('firewall-cmd', ['--quiet', '--permanent', `--add-port=${p}/tcp`], 30_000);
    await exec('firewall-cmd', ['--quiet', '--reload'], 60_000);
    deps.log('webmail : ports 80 et 443 ouverts dans firewalld');
  }
}

/**
 * PHP-FPM sert peut-être d'autres sites : un pool refusé l'empêcherait de redémarrer pour tous.
 * Il est donc validé avant, et retiré s'il pose problème.
 */
async function writePool(fpm: FpmTarget, content: string): Promise<void> {
  const file = `${fpm.poolDir}/${POOL_FILE}`;
  mkdirSync(fpm.poolDir, { recursive: true });
  writeFileSync(file, content, { mode: 0o644 });
  try {
    await exec(fpm.binary, ['-t'], 30_000);
    await exec('systemctl', ['enable', fpm.unit], 30_000);
    await exec('systemctl', ['restart', fpm.unit], 60_000);
  } catch (e) {
    rmSync(file, { force: true });
    rmSync(CONF_FILE, { force: true });
    await tryExec('systemctl', ['restart', fpm.unit], 60_000);
    throw new Error(`Pool PHP-FPM refusé, retiré : ${errText(e)}`);
  }
}

async function writeSite(web: WebServer, conf: string, deps: WebmailDeps): Promise<void> {
  if (web.kind === 'apache') {
    if (web.unit === 'apache2') await exec('a2enmod', ['-q', 'ssl', 'proxy_fcgi', 'setenvif'], 30_000);
    else await deps.pkgInstall(['mod_ssl']);
  }
  const previous = existsSync(web.available) ? readFileSync(web.available, 'utf8') : null;
  writeFileSync(web.available, conf, { mode: 0o644 });
  if (web.enabled && !existsSync(web.enabled)) symlinkSync(web.available, web.enabled);
  try {
    await exec(web.test[0], web.test[1], 30_000);
  } catch (e) {
    if (previous === null) {
      if (web.enabled) rmSync(web.enabled, { force: true });
      rmSync(web.available, { force: true });
    } else {
      writeFileSync(web.available, previous, { mode: 0o644 });
    }
    throw new Error(`Configuration web refusée : ${errText(e)}`);
  }
  // Redémarrage plutôt que reload : Apache ne charge pas de nouveau module ni de nouveau port sans cela
  await exec('systemctl', ['restart', web.unit], 60_000);
}

/** Le service a pu démarrer sans que Roundcube fonctionne (paquet incompatible avec le PHP de la distribution). */
function assertServes(hostname: string): Promise<void> {
  const fail = (detail: string): Error => new Error(`Roundcube ne fonctionne pas sur ce serveur (${detail}). Le webmail n'a pas été activé`);
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      host: '127.0.0.1', port: 443, path: '/', servername: hostname, headers: { host: hostname }, rejectUnauthorized: false, timeout: 30_000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { if (body.length < 200_000) body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 && body.includes('rcmloginuser')) resolve();
        else reject(fail(`réponse ${res.statusCode ?? 'inconnue'} : ${body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('délai dépassé')));
    req.on('error', (e) => reject(fail(e.message)));
    req.end();
  });
}

export async function enableWebmail(state: WebmailState, hostname: string, tls: TlsPaths, deps: WebmailDeps): Promise<void> {
  const web = await detectWebServer(deps.family);
  if (!web) throw new Error('Aucun serveur web actif : le webmail a besoin d\'Apache ou de Nginx');
  if (!(await webmailAvailable(deps.family))) throw new Error('Roundcube n\'est pas disponible dans les dépôts de cette distribution');
  await installPackages(deps);
  const { group, root } = layout(deps.family);
  if (!existsSync(root)) throw new Error(`Roundcube installé, mais ${root} est introuvable`);
  const fpm = await fpmTarget(deps.family);
  const ids = await ensureUser(group);

  mkdirSync(`${DATA_DIR}/temp`, { recursive: true, mode: 0o750 });
  for (const dir of [DATA_DIR, `${DATA_DIR}/temp`]) {
    chownSync(dir, ids.uid, ids.gid);
    chmodSync(dir, 0o750);
  }
  // Contient le jeton et la clé de session : ni les sites, ni hs-* ne doivent pouvoir le lire
  mkdirSync(CONF_DIR, { recursive: true, mode: 0o750 });
  chownSync(CONF_DIR, 0, ids.gid);
  chmodSync(CONF_DIR, 0o750);
  writeFileSync(CONF_FILE, renderConfig(state), { mode: 0o640 });
  chownSync(CONF_FILE, 0, ids.gid);
  chmodSync(CONF_FILE, 0o640);

  await ensureSelinux(deps);
  await initDatabase(deps.family, fpm, deps);

  await writePool(fpm, renderPool(deps.family, fpm.socket, web.user, fpm.disabled));
  try {
    await writeSite(web, web.kind === 'apache' ? renderApache(hostname, root, fpm.socket, tls) : renderNginx(hostname, root, fpm.socket, tls), deps);
    await assertServes(hostname);
  } catch (e) {
    // Rien ne reste à moitié en place : ni site en panne, ni pool inutile, ni configuration qui ferait croire le webmail présent
    if (web.enabled) rmSync(web.enabled, { force: true });
    rmSync(web.available, { force: true });
    await tryExec('systemctl', ['reload', web.unit], 60_000);
    rmSync(`${fpm.poolDir}/${POOL_FILE}`, { force: true });
    rmSync(CONF_FILE, { force: true });
    await tryExec('systemctl', ['restart', fpm.unit], 60_000);
    throw e;
  }
  await openWebPorts(deps).catch((e: Error) => deps.log(`webmail : pare-feu non modifié : ${e.message}`));
}

/** Retire le site et le pool. Paquets, base et préférences restent : réactiver retrouve tout. */
export async function disableWebmail(deps: WebmailDeps): Promise<void> {
  const web = await detectWebServer(deps.family);
  if (web) {
    if (web.enabled) rmSync(web.enabled, { force: true });
    rmSync(web.available, { force: true });
    await exec('systemctl', ['reload', web.unit], 60_000);
  }
  const fpm = await fpmTarget(deps.family);
  rmSync(`${fpm.poolDir}/${POOL_FILE}`, { force: true });
  await tryExec('systemctl', ['restart', fpm.unit], 60_000);
  rmSync(CONF_FILE, { force: true });
}

export async function webmailRunning(family: 'debian' | 'rhel'): Promise<boolean> {
  const fpm = await fpmTarget(family).catch(() => null);
  return fpm !== null && existsSync(fpm.socket) && (await serviceActive(fpm.unit));
}

export async function refreshWebmailOnStart(deps: WebmailDeps): Promise<void> {
  await updateSchema(deps.family, await fpmTarget(deps.family), deps);
}
