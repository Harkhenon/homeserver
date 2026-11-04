// Antispam du service e-mail (rôle : root).
// Socle disponible partout : contrôles HELO et expéditeur, listes noires, réglés dans Postfix.
// Rspamd en plus quand la distribution le fournit, ClamAV à travers lui.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { exec, serviceActive, tryExec } from './mail-util.js';
import type { MailAntispamConfig } from '../server/src/core/privileged/contract.js';

export const DEFAULT_ANTISPAM: MailAntispamConfig = { engine: 'basic', rbl: true, strictSender: true, junkScore: 6, rejectScore: 15, clamav: false };

const RSPAMD_LOCAL = '/etc/rspamd/local.d';
const RSPAMD_MARKER = '# Généré par Homeserver';
export const SPAM_SIEVE = '/etc/dovecot/sieve/homeserver-spam.sieve';
/** Mémoire totale minimale : rspamd + redis ; clamd seul consomme environ 1,2 Go. */
const MIN_RSPAMD_MB = 1500;
const MIN_CLAMAV_MB = 2800;
// Filtre = code de retour : 127.255.255.x veut dire « résolveur refusé », pas « IP listée »
const RBLS = ['zen.spamhaus.org=127.0.0.[2..11]', 'bl.spamcop.net=127.0.0.2'];

export function memoryMb(): number {
  try {
    const kb = Number(readFileSync('/proc/meminfo', 'utf8').match(/^MemTotal:\s+(\d+)/m)?.[1]);
    return Number.isFinite(kb) ? Math.floor(kb / 1024) : 0;
  } catch {
    return 0;
  }
}

/** Rspamd installable depuis les dépôts actifs ? Absent de Fedora et d'EPEL : aucun dépôt tiers n'est ajouté. */
export async function rspamdAvailable(family: 'debian' | 'rhel'): Promise<boolean> {
  if (family === 'debian') {
    const policy = (await tryExec('apt-cache', ['policy', 'rspamd'], 20_000)) ?? '';
    const candidate = policy.match(/Candidate:\s*(\S+)/)?.[1];
    return candidate !== undefined && candidate !== '(none)';
  }
  return (await tryExec('dnf', ['-q', 'info', 'rspamd'], 60_000)) !== null;
}

export function antispamAllowed(family: 'debian' | 'rhel', cfg: MailAntispamConfig, available: boolean): void {
  if (cfg.engine === 'rspamd') {
    if (!available) throw new Error('Rspamd n\'est pas disponible dans les dépôts de cette distribution : seul l\'antispam de base est possible');
    if (memoryMb() < MIN_RSPAMD_MB) throw new Error(`Rspamd demande au moins 2 Go de RAM (${memoryMb()} Mo ici)`);
  }
  if (cfg.clamav) {
    if (cfg.engine !== 'rspamd') throw new Error('ClamAV fonctionne à travers Rspamd : active d\'abord Rspamd');
    if (family !== 'debian') throw new Error('ClamAV n\'est géré que sur Debian et Ubuntu pour l\'instant');
    if (memoryMb() < MIN_CLAMAV_MB) throw new Error(`ClamAV demande au moins 3 Go de RAM (${memoryMb()} Mo ici) : il consomme à lui seul environ 1,2 Go`);
  }
}

/** Paramètres main.cf. Les ports d'envoi authentifié ont leurs propres restrictions (master.cf). */
export function postfixAntispamSettings(cfg: MailAntispamConfig, blockedMap: string): Record<string, string> {
  const recipient = [`check_recipient_access texthash:${blockedMap}`, 'permit_mynetworks'];
  if (cfg.rbl) recipient.push(...RBLS.map((r) => `reject_rbl_client ${r}`));
  return {
    smtpd_recipient_restrictions: recipient.join(' '),
    smtpd_helo_restrictions: cfg.strictSender ? 'permit_mynetworks reject_invalid_helo_hostname reject_non_fqdn_helo_hostname' : '',
    smtpd_sender_restrictions: cfg.strictSender ? 'permit_mynetworks reject_non_fqdn_sender reject_unknown_sender_domain' : '',
    smtpd_milters: cfg.engine === 'rspamd' ? 'inet:127.0.0.1:8891 inet:127.0.0.1:11332' : 'inet:127.0.0.1:8891',
    // Mail produit localement (répondeur, e-mail de test) : signature seulement
    non_smtpd_milters: 'inet:127.0.0.1:8891',
  };
}

/** Sieve global : ce que Rspamd marque comme indésirable va dans Junk. Compilé par root, lu par tous. */
export async function writeSpamSieve(): Promise<void> {
  mkdirSync('/etc/dovecot/sieve', { recursive: true, mode: 0o755 });
  writeFileSync(SPAM_SIEVE, `${RSPAMD_MARKER}
require ["fileinto"];
if header :is "X-Spam" "Yes" {
  fileinto "Junk";
}
`, { mode: 0o644 });
  await exec('sievec', [SPAM_SIEVE], 30_000);
}

function rspamdFiles(cfg: MailAntispamConfig): Record<string, string> {
  return {
    // Self-scan : le proxy milter analyse lui-même, un seul processus à faire tourner
    'worker-proxy.inc': `${RSPAMD_MARKER}
milter = yes;
bind_socket = "127.0.0.1:11332";
timeout = 120s;
upstream "local" {
  default = yes;
  self_scan = yes;
}
`,
    // OpenDKIM signe déjà : pas de double signature. Pas d'interface d'administration ouverte.
    'dkim_signing.conf': `${RSPAMD_MARKER}\nenabled = false;\n`,
    'worker-controller.inc': `${RSPAMD_MARKER}\nenabled = false;\n`,
    'redis.conf': `${RSPAMD_MARKER}\nservers = "127.0.0.1";\n`,
    'actions.conf': `${RSPAMD_MARKER}\nreject = ${cfg.rejectScore};\nadd_header = ${cfg.junkScore};\ngreylist = ${Math.max(1, cfg.junkScore - 2)};\n`,
    'options.inc': `${RSPAMD_MARKER}\ngtube_patterns = "all";\n`,
    'antivirus.conf': cfg.clamav ? `${RSPAMD_MARKER}
clamav {
  action = "reject";
  type = "clamav";
  symbol = "CLAM_VIRUS";
  servers = "/run/clamav/clamd.ctl";
  max_size = 25000000;
  log_clean = false;
}
` : `${RSPAMD_MARKER}\n`,
  };
}

/** Unités à faire tourner pour cette configuration. */
export function antispamUnits(cfg: MailAntispamConfig, family: 'debian' | 'rhel'): string[] {
  const units: string[] = [];
  if (cfg.engine === 'rspamd') units.push(family === 'debian' ? 'redis-server' : 'redis', 'rspamd');
  if (cfg.clamav) units.push('clamav-freshclam', 'clamav-daemon');
  return units;
}

/** Installe et configure ; arrête ce qui n'est plus demandé. Redis reste : d'autres applications peuvent s'en servir. */
export async function applyAntispam(
  cfg: MailAntispamConfig,
  family: 'debian' | 'rhel',
  pkgInstall: (packages: string[]) => Promise<void>,
  pkgRefresh: () => Promise<void>,
): Promise<void> {
  if (cfg.engine === 'rspamd') {
    await pkgRefresh();
    await pkgInstall(family === 'debian' ? ['rspamd', 'redis-server'] : ['rspamd', 'redis']);
    if (cfg.clamav) await pkgInstall(['clamav-daemon', 'clamav-freshclam']);
    mkdirSync(RSPAMD_LOCAL, { recursive: true, mode: 0o755 });
    for (const [name, content] of Object.entries(rspamdFiles(cfg))) writeFileSync(`${RSPAMD_LOCAL}/${name}`, content, { mode: 0o644 });
    await exec('rspamadm', ['configtest'], 60_000);
    for (const unit of antispamUnits(cfg, family)) {
      await exec('systemctl', ['enable', unit], 30_000);
      // clamd ne démarre qu'une fois la base téléchargée : freshclam s'en occupe en arrière-plan
      if (unit === 'clamav-daemon') await tryExec('systemctl', ['restart', '--no-block', unit], 30_000);
      else await exec('systemctl', ['restart', unit], 120_000);
    }
  }
  if (!cfg.clamav) {
    for (const unit of ['clamav-daemon', 'clamav-freshclam']) {
      if (await serviceActive(unit)) await tryExec('systemctl', ['disable', '--now', unit], 60_000);
    }
  }
  if (cfg.engine !== 'rspamd' && (await serviceActive('rspamd'))) {
    await exec('systemctl', ['disable', '--now', 'rspamd'], 60_000);
  }
}
