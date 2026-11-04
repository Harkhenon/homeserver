// Service de politique Postfix : limite d'envoi par compte, sur une heure glissante.
// Postfix ne sait limiter que par IP ; or une boîte piratée est utilisée depuis des IP variées.
// Sans état durable (un redémarrage remet les compteurs à zéro) et sans privilège : voir l'unité
// hs-mail-policy.service. S'il ne répond pas, Postfix laisse passer (panne de limite, pas de mail).
import { createServer, type Socket } from 'node:net';
import { readFileSync, statSync } from 'node:fs';

const LIMITS_FILE = process.env.HS_MAIL_LIMITS ?? '/etc/postfix/homeserver/send_limits.json';
const PORT = 10031;
const WINDOW_MS = 3_600_000;
const MAX_REQUEST = 16_384;

let limits: Record<string, number> = {};
let limitsMtime = 0;
const sent = new Map<string, Array<{ at: number; count: number }>>();

function loadLimits(): void {
  try {
    const { mtimeMs } = statSync(LIMITS_FILE);
    if (mtimeMs === limitsMtime) return;
    limits = JSON.parse(readFileSync(LIMITS_FILE, 'utf8')) as Record<string, number>;
    limitsMtime = mtimeMs;
  } catch {
    // Fichier absent ou illisible : on garde les dernières limites connues
  }
}

function decide(attrs: Map<string, string>): string {
  const user = (attrs.get('sasl_username') ?? '').toLowerCase();
  if (attrs.get('protocol_state') !== 'END-OF-MESSAGE' || !user) return 'dunno';
  loadLimits();
  const limit = limits[user];
  if (!limit) return 'dunno'; // absent ou 0 : pas de limite
  const count = Math.max(1, Number(attrs.get('recipient_count')) || 1);
  const now = Date.now();
  const recent = (sent.get(user) ?? []).filter((e) => now - e.at < WINDOW_MS);
  const used = recent.reduce((n, e) => n + e.count, 0);
  if (used + count > limit) {
    sent.set(user, recent);
    console.log(`limite atteinte pour ${user} : ${used}+${count} > ${limit}/h`);
    return `450 4.7.1 Sending limit reached (${limit} recipients per hour), try again later`;
  }
  recent.push({ at: now, count });
  sent.set(user, recent);
  return 'dunno';
}

function handle(socket: Socket): void {
  let buf = '';
  socket.setEncoding('utf8');
  socket.setTimeout(30_000, () => socket.destroy());
  socket.on('error', () => socket.destroy());
  socket.on('data', (chunk: string) => {
    buf += chunk;
    if (buf.length > MAX_REQUEST) {
      socket.destroy();
      return;
    }
    let end: number;
    // Postfix garde la connexion ouverte : plusieurs requêtes, chacune terminée par une ligne vide
    while ((end = buf.indexOf('\n\n')) >= 0) {
      const attrs = new Map<string, string>();
      for (const line of buf.slice(0, end).split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) attrs.set(line.slice(0, eq), line.slice(eq + 1));
      }
      buf = buf.slice(end + 2);
      socket.write(`action=${decide(attrs)}\n\n`);
    }
  });
}

// Boucle locale uniquement : ce port ne doit jamais être joignable de l'extérieur
createServer(handle).listen(PORT, '127.0.0.1', () => console.log(`hs-mail-policy à l'écoute sur 127.0.0.1:${PORT}`));

// Ménage des comptes inactifs
setInterval(() => {
  const now = Date.now();
  for (const [user, entries] of sent) {
    const recent = entries.filter((e) => now - e.at < WINDOW_MS);
    if (recent.length === 0) sent.delete(user);
    else sent.set(user, recent);
  }
}, 600_000).unref();
