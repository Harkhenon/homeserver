#!/usr/bin/env python3
"""Phase 2 : DNS, délivrabilité, relais. VM jetable, root.
usage : mail2-dns.py <mdp-admin> [<ip-relais> <utilisateur-relais> <mdp-relais> <destinataire-sur-relais>]"""
import email, imaplib, json, smtplib, ssl, subprocess, sys, time, urllib.request, urllib.error

API = 'http://127.0.0.1:3000/api'
ADMIN = sys.argv[1]
HOST, DOMAIN = 'mail.bench.test', 'bench.test'
PW = 'Boite-De-Test-2026!'
fails = 0
RELAY = sys.argv[2:6] if len(sys.argv) >= 6 else None


def check(label, ok, extra=''):
    global fails
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{extra}]' if extra and not ok else ''))
    if not ok:
        fails += 1


def post(path, body=None, token=None):
    req = urllib.request.Request(f'{API}/{path}', data=json.dumps(body or {}).encode(), method='POST',
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=1800) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)


token = post('auth/login', {'username': 'admin', 'password': ADMIN})['token']
mail = lambda a, b=None: post(f'mail/{a}', b, token)
bind = lambda a, b=None: post(f'bind9/{a}', b, token)


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


def statuses(domain=DOMAIN):
    r = mail('dns.records', {'domain': domain})
    return r, {x['key']: x['status'] for x in r['data']['records']} if r.get('ok') else {}


ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

r = mail('setup', {'hostname': HOST})
check('setup', r.get('ok'), json.dumps(r)[:600])
if not r.get('ok'):
    sys.exit(1)

# Zone Bind avec un SPF déjà présent et voulu
r = bind('zones.create', {'domain': DOMAIN})
check('zone créée', r.get('ok'), json.dumps(r)[:300])
r = bind('records.add', {'zone': DOMAIN, 'name': '@', 'type': 'TXT', 'value': 'v=spf1 a -all'})
check('SPF manuel ajouté', r.get('ok'), json.dumps(r)[:300])

# Bug corrigé : un enregistrement invalide ne doit plus détruire la zone
r = bind('records.add', {'zone': DOMAIN, 'name': 'cassé !!', 'type': 'MX', 'value': 'pas valide du tout'})
check('enregistrement invalide refusé', not r.get('ok'))
r = bind('zones.get', {'id': DOMAIN})
check('zone intacte après un enregistrement invalide', r.get('ok') and any('spf1' in x['value'] for x in r['data']['records']), json.dumps(r)[:300])

r = mail('domains.add', {'domain': DOMAIN, 'defaultQuotaMb': 500})
check('domaine mail ajouté', r.get('ok'))
r = mail('boxes.add', {'domain': DOMAIN, 'local': 'alice', 'password': PW, 'displayName': ''})
check('boîte créée', r.get('ok'))

r, st = statuses()
check('dns.records : zone locale détectée', r.get('ok') and r['data']['zone'] is True, json.dumps(r)[:300])
check('MX et DKIM absents avant publication', st.get('mx') == 'missing' and st.get('dkim') == 'missing', str(st))
check('SPF manuel vu comme différent', st.get('spf') == 'different', str(st))

r = mail('dns.apply', {'domain': DOMAIN})
check('publication', r.get('ok'), json.dumps(r)[:400])
d = r.get('data', {})
check('SPF existant non écrasé : conflit signalé', any(c['label'] == 'SPF' for c in d.get('conflicts', [])), json.dumps(d)[:300])
check('enregistrements ajoutés', len(d.get('added', [])) >= 8, str(d.get('added')))
time.sleep(2)
r, st = statuses()
check('MX publié', st.get('mx') == 'ok', str(st))
check('DKIM long publié et lu en entier', st.get('dkim') == 'ok', str(st))
check('DMARC, TLS-RPT, SRV, autoconfig publiés', all(st.get(k) == 'ok' for k in ['dmarc', 'tlsrpt', 'srv-submission', 'srv-imaps', 'srv-pop3s', 'autoconfig']), str(st))
check('A du serveur publié', st.get('host') == 'ok', str(st))
check('SPF toujours différent', st.get('spf') == 'different', str(st))
r = mail('dns.apply', {'domain': DOMAIN})
check('2e publication : rien à ajouter', r.get('ok') and not r['data']['added'] and len(r['data']['conflicts']) == 1, json.dumps(r)[:300])
r = mail('dns.apply', {'domain': DOMAIN, 'replace': True})
check('remplacement demandé : SPF corrigé', r.get('ok') and 'SPF' in r['data']['replaced'], json.dumps(r)[:300])
time.sleep(2)
_, st = statuses()
check('SPF publié', st.get('spf') == 'ok', str(st))
zone = bind('zones.get', {'id': DOMAIN})['data']['records']
check('un seul SPF dans la zone', sum('spf1' in x['value'] for x in zone) == 1)
chk = sh(f"named-checkzone {DOMAIN} $(ls /etc/bind/zones/{DOMAIN}.zone /etc/named/{DOMAIN}.zone 2>/dev/null | head -1)")
check('named-checkzone OK', chk.strip().endswith('OK'), chk)


def inbox_msg(subject):
    for _ in range(25):
        m = imaplib.IMAP4_SSL('127.0.0.1', 993, ssl_context=ctx)
        m.login(f'alice@{DOMAIN}', PW)
        m.select('INBOX')
        _, ids = m.search(None, 'ALL')
        for i in reversed(ids[0].split()):
            _, d = m.fetch(i, '(RFC822)')
            if email.message_from_bytes(d[0][1])['Subject'] == subject:
                raw = d[0][1]
                m.logout()
                return raw
        m.logout()
        time.sleep(1)
    return None


def send(subject):
    s = smtplib.SMTP('127.0.0.1', 587, timeout=30)
    s.starttls(context=ctx)
    s.login(f'alice@{DOMAIN}', PW)
    s.sendmail(f'alice@{DOMAIN}', [f'alice@{DOMAIN}'], f'From: alice@{DOMAIN}\r\nTo: alice@{DOMAIN}\r\nSubject: {subject}\r\nDate: {email.utils.formatdate()}\r\nMessage-ID: <{time.time()}@{DOMAIN}>\r\n\r\nCorps\r\n')
    s.quit()
    return inbox_msg(subject)


def dkim_verify(raw):
    """Vérification cryptographique avec la clé réellement publiée dans le DNS."""
    import dkim

    def dnsfunc(name, timeout=5):
        out = sh(f"dig +short TXT {name.decode().rstrip('.')} @127.0.0.1")
        return ''.join(p.strip().strip('"') for p in out.replace('" "', '').split('\n')).encode()
    return dkim.verify(raw, dnsfunc=dnsfunc)


raw = send('dkim1')
check('message reçu', raw is not None)
try:
    check('signature DKIM valide contre le DNS', raw is not None and dkim_verify(raw) is True)
except ImportError:
    check('python3-dkim disponible', False)

# Rotation
r = mail('dkim.rotate', {'domain': DOMAIN})
check('rotation préparée', r.get('ok') and r['data']['dkimPending']['selector'] == 'hs2', json.dumps(r)[:200])
r = mail('dkim.activate', {'domain': DOMAIN})
check('activation refusée tant que la clé n\'est pas publiée', not r.get('ok'))
r = mail('dns.apply', {'domain': DOMAIN})
check('nouvelle clé publiée', r.get('ok') and any('nouvelle' in a for a in r['data']['added']), json.dumps(r)[:300])
time.sleep(2)
r = mail('dkim.activate', {'domain': DOMAIN})
check('activation acceptée', r.get('ok') and r['data']['dkim']['selector'] == 'hs2' and not r['data']['dkimPending'], json.dumps(r)[:300])
time.sleep(1)
raw = send('dkim2')
check('signature avec hs2', raw is not None and b's=hs2' in raw)
try:
    check('signature hs2 valide contre le DNS', raw is not None and dkim_verify(raw) is True)
except ImportError:
    pass
check('ancienne clé conservée sur le disque', bool(sh(f'ls /etc/opendkim/keys/{DOMAIN}/hs1.private').strip()))

# Autoconfig
xml = sh(f"curl -s -H 'Host: autoconfig.{DOMAIN}' http://127.0.0.1/mail/config-v1.1.xml")
check('autoconfig servie', f'<hostname>{HOST}</hostname>' in xml and f'<domain>{DOMAIN}</domain>' in xml, xml[:300])
for w in ('apache', 'nginx'):
    v = post(f'{w}/vhosts.list', {}, token)
    if v.get('ok'):
        check(f'vhost technique absent des sites ({w})', not any('autoconfig' in json.dumps(x) for x in v['data']))

# Délivrabilité
r = mail('deliverability.check')
check('diagnostic', r.get('ok'), json.dumps(r)[:300])
d = r.get('data', {})
print('      ', json.dumps({k: d.get(k) for k in ['ip', 'ipPrivate', 'hostnameResolves', 'port25']}, ensure_ascii=False)[:300])
check('IP privée détectée', d.get('ipPrivate') is True)
check('nom d\'hôte résolu', d.get('hostnameResolves') is True)
r = mail('settings.set', {'publicIp': '203.0.113.10'})
check('IP publique enregistrée', r.get('ok') and r['data']['publicIp'] == '203.0.113.10')
_, st = statuses()
check('A attendu suit l\'IP publique', st.get('host') == 'different', str(st))
r = mail('settings.set', {'publicIp': 'pas-une-ip'})
check('IP invalide refusée', not r.get('ok'))
r = mail('settings.set', {'publicIp': None})
check('IP publique retirée', r.get('ok') and r['data']['publicIp'] is None)

# E-mail de test
r = mail('test.send', {'domain': DOMAIN, 'to': f'alice@{DOMAIN}'})
check('e-mail de test local : livré', r.get('ok') and r['data']['status'] == 'sent', json.dumps(r)[:300])
check('e-mail de test reçu et signé', (lambda m: m is not None and b'DKIM-Signature' in m)(inbox_msg('Test de messagerie Homeserver')))
r = mail('test.send', {'domain': DOMAIN, 'to': 'x@domaine-inexistant.invalid'})
check('e-mail de test impossible : état rapporté', r.get('ok') and r['data']['status'] in ('bounced', 'deferred'), json.dumps(r)[:300])
sh('postsuper -d ALL deferred')
r = mail('test.send', {'domain': 'inconnu.test', 'to': 'a@b.test'})
check('domaine inconnu refusé', not r.get('ok'))

# Relais authentifié
if RELAY:
    ip, user, pw, dest = RELAY
    r = mail('relay.set', {'host': ip, 'port': 587, 'username': user, 'password': pw, 'spfInclude': 'spf.relais.test'})
    check('relais configuré', r.get('ok') and r['data']['relay']['host'] == ip and 'password' not in json.dumps(r['data']), json.dumps(r)[:300])
    check('mot de passe du relais non lisible par hs-*', pw not in sh("runuser -u $(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}') -- sh -c 'cat /etc/postfix/homeserver/relay_passwd /var/lib/homeserver-mail/state.json 2>&1'"))
    _, _st = statuses()
    rec = [x for x in mail('dns.records', {'domain': DOMAIN})['data']['records'] if x['key'] == 'spf'][0]
    check('SPF attendu inclut le relais', 'include:spf.relais.test' in rec['value'], rec['value'])
    r = mail('test.send', {'domain': DOMAIN, 'to': dest})
    check(f'envoi via le relais vers {dest}', r.get('ok') and r['data']['status'] == 'sent', json.dumps(r)[:500] + sh('postconf relayhost smtp_tls_security_level; journalctl --no-pager -n 30 -o cat | grep -E "smtp\\[|warning" | tail -6'))
    print('       ', r.get('data', {}).get('detail', '')[:160])
    r = mail('relay.clear')
    check('relais retiré', r.get('ok') and r['data']['relay'] is None and sh('postconf -h relayhost').strip() == '')
    check('SASL coupé', sh('postconf -h smtp_sasl_auth_enable').strip() == 'no')

# Domaine sans zone : mode manuel
r = mail('domains.add', {'domain': 'registrar.test', 'defaultQuotaMb': 10})
r = mail('dns.records', {'domain': 'registrar.test'})
check('domaine sans zone : mode manuel', r.get('ok') and r['data']['zone'] is False)
r = mail('dns.apply', {'domain': 'registrar.test'})
check('publication refusée sans zone', not r.get('ok'))

print(f'=== {fails} échec(s) ===')
sys.exit(1 if fails else 0)
