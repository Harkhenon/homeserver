// API simulée avec état, pour travailler sur l'interface sans serveur (identifiants factices, rien n'est vérifié). Lancée par vite-mock.cjs.
const http = require('http');
let configured = false;
const domains = {};
let webmailOn = false;
let antispam = { engine: 'basic', rbl: true, strictSender: true, junkScore: 6, rejectScore: 15, clamav: false };
let backups = [
  { file: 'mail-exemple.fr-20261103T101500.tar.gz', domain: 'exemple.fr', local: null, sizeMb: 842, createdAt: '2026-11-03T10:15:00Z' },
  { file: 'mail-exemple.fr+contact-20261102T090000.tar.gz', domain: 'exemple.fr', local: 'contact', sizeMb: 310, createdAt: '2026-11-02T09:00:00Z' },
];
let queue = [
  { id: '4Xk2Lq1Bz7', queue: 'deferred', arrivalAt: '2026-11-04T08:12:00Z', sizeBytes: 18234, sender: 'contact@exemple.fr', recipients: [{ address: 'client@gmail.com', reason: 'connect to gmail-smtp-in.l.google.com[142.250.1.27]:25: Connection timed out' }] },
  { id: '4Xk2Lq9Trm', queue: 'hold', arrivalAt: '2026-11-04T07:40:00Z', sizeBytes: 2300000, sender: '', recipients: [{ address: 'a@outlook.com', reason: null }, { address: 'une.adresse.vraiment.tres.longue.pour.tester@exemple-de-domaine-long.org', reason: null }] },
];
const dkim = { selector: 'hs1', record: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gunVTLw7onLRnrq0' };
const info = (d) => ({ maxBoxes: 0, sendLimitPerHour: 500, aliasCount: Object.keys(domains[d].aliases ?? {}).length, catchAll: domains[d].catchAll ?? null, usedMb: 1840, dkimPending: null, domain: d, suspended: domains[d].suspended, defaultQuotaMb: domains[d].q, boxCount: Object.keys(domains[d].boxes).length, dkim, createdAt: '2026-11-03T00:00:00Z' });
const status = () => ({
  installed: configured, configured, hostname: configured ? 'mail.exemple.fr' : null, serverIp: '192.168.1.131',
  services: configured ? { postfix: true, dovecot: true, opendkim: true, 'hs-mail-policy': true } : { postfix: false, dovecot: false, opendkim: false },
  dovecotVersion: '2.4.2', tls: { mode: configured ? 'selfsigned' : null, expiresAt: configured ? '2036-11-01T00:00:00Z' : null },
  publicIp: null, relay: null, antispam, webmail: { available: true, webServer: true, enabled: webmailOn, active: webmailOn, url: webmailOn ? 'https://mail.exemple.fr/' : null }, rspamdAvailable: true, memoryMb: 1900, clockSynced: false, domainCount: Object.keys(domains).length, boxCount: Object.values(domains).reduce((n, d) => n + Object.keys(d.boxes).length, 0),
});
const mail = {
  status,
  'webmail.set': (p) => { webmailOn = p.enabled; return status(); },
  'antispam.set': (p) => { antispam = p; return status(); },
  'queue.list': () => ({ items: queue, total: queue.length }),
  'queue.action': (p) => {
    if (p.action === 'delete') queue = p.id ? queue.filter((m) => m.id !== p.id) : [];
    const m = queue.find((x) => x.id === p.id);
    if (m && p.action === 'hold') m.queue = 'hold';
    if (m && p.action === 'release') m.queue = 'deferred';
    return { items: queue, total: queue.length };
  },
  logs: (p) => ({ lines: [
    '2026-11-04T08:12:01+0100 mail postfix/submission-587/smtpd[2101]: 4Xk2Lq1Bz7: client=box[203.0.113.5], sasl_method=PLAIN, sasl_username=contact@exemple.fr',
    '2026-11-04T08:12:02+0100 mail postfix/smtp[2105]: 4Xk2Lq1Bz7: to=<client@gmail.com>, relay=none, delay=30, status=deferred (connect to gmail-smtp-in.l.google.com[142.250.1.27]:25: Connection timed out)',
    '2026-11-04T08:15:44+0100 mail dovecot[812]: lmtp(contact@exemple.fr)<3012>: msgid=<a@b>: saved mail to INBOX',
  ].filter((l) => !p.query || l.includes(p.query)) }),
  'backups.list': () => ({ backups }),
  'backups.create': (p) => { const b = { file: 'mail-' + p.domain + (p.local ? '+' + p.local : '') + '-20261104T120000.tar.gz', domain: p.domain, local: p.local ?? null, sizeMb: 12, createdAt: new Date().toISOString() }; backups = [b, ...backups]; return b; },
  'backups.delete': (p) => { backups = backups.filter((b) => b.file !== p.file); return { deleted: true }; },
  'backups.restore': () => ({ restored: true, recreatedBoxes: [] }),
  setup: () => { configured = true; return status(); },
  'service.set': (p) => ({ ...status(), services: { postfix: p.enabled, dovecot: p.enabled, opendkim: p.enabled } }),
  'domains.list': () => ({ domains: Object.keys(domains).map(info) }),
  'domains.add': (p) => { domains[p.domain] = { suspended: false, q: p.defaultQuotaMb ?? 2048, boxes: {} }; return info(p.domain); },
  'domains.update': (p) => { if (p.suspended !== undefined) domains[p.domain].suspended = p.suspended; return info(p.domain); },
  'domains.delete': (p) => { delete domains[p.domain]; return { deleted: true }; },
  'boxes.list': (p) => ({ boxes: Object.values(domains[p.domain].boxes) }),
  'boxes.add': (p) => {
    if (p.password && p.password.length < 12) throw new Error('Mot de passe trop court (12 min.)');
    const b = { address: `${p.local}@${p.domain}`, local: p.local, displayName: p.displayName ?? '', quotaMb: p.quotaMb ?? domains[p.domain].q, usedMb: p.local === 'contact' ? 1840 : 12, messages: 128, forward: null, vacation: null, sendLimitPerHour: null, effectiveSendLimit: 500, suspended: false, createdAt: '2026-11-03T00:00:00Z' };
    domains[p.domain].boxes[p.local] = b;
    return p.password ? b : { ...b, generatedPassword: 'gEnErE-pAr-lE-mOcK-A1' };
  },
  'boxes.update': (p) => { const b = domains[p.domain].boxes[p.local]; for (const k of ['quotaMb', 'suspended', 'displayName']) if (p[k] !== undefined) b[k] = p[k]; return b; },
  'boxes.password': (p) => (p.password ? { updated: true } : { updated: true, generatedPassword: 'nOuVeAu-MoCk-A1' }),
  'boxes.delete': (p) => { delete domains[p.domain].boxes[p.local]; return { deleted: true }; },
  'aliases.list': (p) => ({ aliases: Object.entries(domains[p.domain].aliases ?? {}).map(([l, a]) => ({ address: l + '@' + p.domain, local: l, destinations: a, createdAt: '' })), catchAll: domains[p.domain].catchAll ?? null }),
  'aliases.set': (p) => { (domains[p.domain].aliases ??= {})[p.local] = String(p.destinations).split(/[\s,]+/).filter(Boolean); return { ok: true }; },
  'aliases.delete': (p) => { delete domains[p.domain].aliases[p.local]; return { deleted: true }; },
  'catchall.set': (p) => { domains[p.domain].catchAll = p.destination || null; return { catchAll: p.destination || null }; },
  'boxes.forward': (p) => { const b = domains[p.domain].boxes[p.local]; const d = String(p.destinations).split(/[\s,]+/).filter(Boolean); b.forward = d.length ? { destinations: d, keepCopy: p.keepCopy } : null; return b; },
  'boxes.vacation': (p) => { const b = domains[p.domain].boxes[p.local]; b.vacation = { enabled: p.enabled, subject: p.subject, message: p.message, startDate: p.startDate || null, endDate: p.endDate || null }; return b; },
  'dns.records': () => ({ zone: true, records: [
    { key: 'host', label: 'Serveur (A)', purpose: 'Adresse du serveur', required: true, fqdn: 'mail.exemple.fr', type: 'A', value: '203.0.113.10', status: 'ok', current: '203.0.113.10' },
    { key: 'mx', label: 'Réception (MX)', purpose: 'Serveur de réception', required: true, fqdn: 'exemple.fr', type: 'MX', value: '10 mail.exemple.fr.', status: 'ok', current: '10 mail.exemple.fr' },
    { key: 'spf', label: 'SPF', purpose: 'Serveurs autorisés', required: true, fqdn: 'exemple.fr', type: 'TXT', value: 'v=spf1 mx -all', status: 'different', current: 'v=spf1 a -all' },
    { key: 'dkim', label: 'DKIM', purpose: 'Clé publique', required: true, fqdn: 'hs1._domainkey.exemple.fr', type: 'TXT', value: dkim.record + 'x'.repeat(280), status: 'missing', current: null },
    { key: 'tlsrpt', label: 'TLS-RPT', purpose: 'Rapports', required: false, fqdn: '_smtp._tls.exemple.fr', type: 'TXT', value: 'v=TLSRPTv1; rua=mailto:postmaster@exemple.fr', status: 'missing', current: null },
  ] }),
  'dns.apply': (p) => (p.replace ? { added: [], replaced: ['SPF'], unchanged: [], conflicts: [] } : { added: ['DKIM'], replaced: [], unchanged: ['MX'], conflicts: [{ label: 'SPF', current: 'TXT v=spf1 a -all', expected: 'TXT v=spf1 mx -all' }] }),
  'dkim.rotate': (p) => ({ ...info(p.domain), dkimPending: { selector: 'hs2', record: dkim.record } }),
  'deliverability.check': () => ({ ip: '203.0.113.10', ipPrivate: false, hostname: 'mail.exemple.fr', hostnameResolves: true, rdns: { ptr: ['vps1.hebergeur.net'], matches: false }, port25: { ok: false, detail: 'gmail-smtp-in.l.google.com:25 injoignable (ETIMEDOUT)' }, relay: null, blacklists: [{ list: 'zen.spamhaus.org', listed: false }, { list: 'bl.spamcop.net', listed: null }] }),
  'test.send': () => ({ messageId: 'x', status: 'deferred', detail: 'connect to gmail-smtp-in.l.google.com[142.250.1.27]:25: Connection timed out' }),
  'settings.set': () => status(),
  'tls.issue': () => { throw new Error('Certificat refusé. Vérifie que mail.exemple.fr pointe vers ce serveur'); },
};
const vhost = { id: 'blog', domain: 'blog.exemple.fr', docroot: '/var/www/blog', enabled: true, aliases: [], ssl: false, phpVersion: null, nodePort: null, serverAdmin: null, confFile: null };
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const p = body ? JSON.parse(body) : {};
    const [, , mod, action] = req.url.split('/');
    if (mod === 'auth') {
      if (action === 'login') return send(200, { token: 'mock', username: p.username, csrfToken: 'x' });
      if (action === 'me') return send(200, { username: 'admin', totpEnabled: false });
      return send(200, { ok: true, data: {} });
    }
    if (mod === 'health') return send(200, { status: 'ok', modules: [] });
    try {
      if (mod === 'mail') return send(200, { ok: true, data: mail[action](p) });
      if (mod === 'bind9' && action === 'zones.list') return send(200, { ok: true, data: [{ id: 'exemple.fr', domain: 'exemple.fr', external: false, records: [] }] });
      if ((mod === 'apache' || mod === 'nginx') && action === 'vhosts.list') return send(200, { ok: true, data: mod === 'apache' ? [vhost] : [] });
      return send(200, { ok: true, data: {} });
    } catch (e) { return send(400, { ok: false, error: e.message }); }
  });
}).listen(Number(process.env.HS_MOCK_PORT ?? 3901), '127.0.0.1', () => console.log(`API simulée sur 127.0.0.1:${process.env.HS_MOCK_PORT ?? 3901}`));
