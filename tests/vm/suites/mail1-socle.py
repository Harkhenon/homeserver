#!/usr/bin/env python3
"""Test bout en bout du service e-mail, via l'API du panel (VM jetable, root).
usage : mail1-socle.py <mot-de-passe-admin> [--no-setup]"""
import email, imaplib, json, poplib, smtplib, ssl, subprocess, sys, time, urllib.request, urllib.error

API = 'http://127.0.0.1:3000/api'
ADMIN = sys.argv[1]
HOST = 'mail.bench.test'
DOMAIN = 'bench.test'
PW = 'Boite-De-Test-2026!'
fails = 0


def check(label, ok, extra=''):
    global fails
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{extra}]' if extra and not ok else ''))
    if not ok:
        fails += 1


def post(path, body=None, token=None, timeout=1800):
    req = urllib.request.Request(f'{API}/{path}', data=json.dumps(body or {}).encode(), method='POST',
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)


token = post('auth/login', {'username': 'admin', 'password': ADMIN})['token']


def mail(action, body=None):
    return post(f'mail/{action}', body, token)


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

if '--no-setup' not in sys.argv:
    t = time.time()
    r = mail('setup', {'hostname': HOST})
    check(f'setup ({int(time.time() - t)}s)', r.get('ok') and r['data']['configured'], json.dumps(r)[:900])
    if not r.get('ok'):
        sys.exit(1)

r = mail('status')
check('3 services actifs', r['ok'] and all(r['data']['services'].values()), json.dumps(r))
print('      dovecot', r['data']['dovecotVersion'], 'tls', r['data']['tls']['mode'])

r = mail('domains.add', {'domain': DOMAIN, 'defaultQuotaMb': 100})
check('domaine ajouté', r['ok'], json.dumps(r)[:300])
check('clé DKIM générée', r['ok'] and r['data']['dkim'] and r['data']['dkim']['record'].startswith('v=DKIM1'))

r = mail('boxes.add', {'domain': DOMAIN, 'local': 'alice', 'password': PW, 'displayName': 'Alice'})
check('boîte alice créée', r['ok'], json.dumps(r)[:300])
r = mail('boxes.add', {'domain': DOMAIN, 'local': 'bob', 'displayName': ''})
check('boîte bob, mot de passe généré', r['ok'] and r['data'].get('generatedPassword'), json.dumps(r)[:300])
bob_pw = r['data']['generatedPassword']
r = mail('boxes.add', {'domain': DOMAIN, 'local': 'carol', 'password': 'faible', 'displayName': ''})
check('mot de passe faible refusé', not r['ok'])
r = mail('boxes.add', {'domain': DOMAIN, 'local': '../etc', 'password': PW, 'displayName': ''})
check('nom de boîte malveillant refusé', not r['ok'])
r = mail('domains.add', {'domain': 'evil.test\nmynetworks = 0.0.0.0/0', 'defaultQuotaMb': 1})
check('injection de conf par domaine refusée', not r['ok'])

time.sleep(2)
hashes = sh("runuser -u $(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}') -- sh -c 'cat /var/lib/homeserver-mail/state.json /etc/dovecot/homeserver-users /etc/opendkim/keys/bench.test/hs1.private 2>&1'")
check('hs-* ne lit ni hashes ni clés', 'ARGON2' not in hashes and 'PRIVATE KEY' not in hashes, hashes[:200])
check('aucun mot de passe en clair sur disque', PW not in sh('cat /var/lib/homeserver-mail/state.json /etc/dovecot/homeserver-users /var/log/homeserver/helper.log 2>/dev/null'))


def sent(subject, frm, to):
    return f'From: {frm}\r\nTo: {to}\r\nSubject: {subject}\r\nDate: {email.utils.formatdate()}\r\nMessage-ID: <{time.time()}@bench.test>\r\n\r\nCorps de test\r\n'


def imap_subjects(user, pw):
    m = imaplib.IMAP4_SSL('127.0.0.1', 993, ssl_context=ctx)
    m.login(user, pw)
    m.select('INBOX')
    _, ids = m.search(None, 'ALL')
    out = []
    for i in ids[0].split():
        _, d = m.fetch(i, '(RFC822)')
        out.append(email.message_from_bytes(d[0][1]))
    m.logout()
    return out


def wait_subject(user, pw, subject, tries=15):
    for _ in range(tries):
        for msg in imap_subjects(user, pw):
            if msg['Subject'] == subject:
                return msg
        time.sleep(1)
    return None


# Envoi authentifié 587 STARTTLS vers bob
s = smtplib.SMTP('127.0.0.1', 587, timeout=30)
s.starttls(context=ctx)
s.login(f'alice@{DOMAIN}', PW)
s.sendmail(f'alice@{DOMAIN}', [f'bob@{DOMAIN}'], sent('via587', f'alice@{DOMAIN}', f'bob@{DOMAIN}'))
s.quit()
msg = wait_subject(f'bob@{DOMAIN}', bob_pw, 'via587')
check('envoi 587 STARTTLS, réception IMAP 993', msg is not None, sh('journalctl -u postfix --no-pager -n 15 | tail -15'))
check('signature DKIM présente', msg is not None and 'DKIM-Signature' in msg, sh('journalctl -u opendkim --no-pager -n 8'))

# Envoi 465 TLS implicite
s = smtplib.SMTP_SSL('127.0.0.1', 465, timeout=30, context=ctx)
s.login(f'bob@{DOMAIN}', bob_pw)
s.sendmail(f'bob@{DOMAIN}', [f'alice@{DOMAIN}'], sent('via465', f'bob@{DOMAIN}', f'alice@{DOMAIN}'))
s.quit()
check('envoi 465 TLS', wait_subject(f'alice@{DOMAIN}', PW, 'via465') is not None)

# Réception externe port 25
s = smtplib.SMTP('127.0.0.1', 25, timeout=30)
s.ehlo('dehors.example')
s.sendmail('x@dehors.example', [f'alice@{DOMAIN}'], sent('via25', 'x@dehors.example', f'alice@{DOMAIN}'))
s.quit()
check('réception port 25', wait_subject(f'alice@{DOMAIN}', PW, 'via25') is not None)

# POP3
p = poplib.POP3_SSL('127.0.0.1', 995, context=ctx)
p.user(f'alice@{DOMAIN}')
p.pass_(PW)
check('POP3 995', p.stat()[0] >= 2)
p.quit()

# Depuis l'IP externe : le relais ne doit pas être ouvert (127.0.0.1 est dans mynetworks)
ip = mail('status')['data']['serverIp']
s = smtplib.SMTP(ip, 25, timeout=30)
# Expéditeur et HELO valides : sinon le contrôle strict de l'expéditeur refuse avant la règle anti-relais
s.ehlo('relais.exemple.org')
code, _ = s.docmd('MAIL FROM:<contact@gmail.com>')
code, reply = s.docmd('RCPT TO:<victime@gmail.com>')
s.quit()
check('relais ouvert impossible (port 25, IP externe)', code >= 500 and code != 250, f'{code} {reply}')

# Authentification sur le port 25 refusée, mauvais mot de passe, usurpation d'expéditeur
s = smtplib.SMTP('127.0.0.1', 587, timeout=30)
s.starttls(context=ctx)
try:
    s.login(f'alice@{DOMAIN}', 'mauvais-mot-de-passe')
    check('mauvais mot de passe refusé', False)
except smtplib.SMTPAuthenticationError:
    check('mauvais mot de passe refusé', True)
s.quit()
s = smtplib.SMTP('127.0.0.1', 587, timeout=30)
try:
    s.docmd('EHLO test')
    code, _ = s.docmd('AUTH PLAIN AGFsaWNl')
    check('AUTH sans TLS refusé sur 587', code >= 500, str(code))
finally:
    s.close()
s = smtplib.SMTP('127.0.0.1', 587, timeout=30)
s.starttls(context=ctx)
s.login(f'alice@{DOMAIN}', PW)
try:
    s.sendmail(f'bob@{DOMAIN}', [f'alice@{DOMAIN}'], sent('usurpe', f'bob@{DOMAIN}', f'alice@{DOMAIN}'))
    check('usurpation d\'expéditeur refusée', False)
except smtplib.SMTPException:
    check('usurpation d\'expéditeur refusée', True)
s.close()

# Quota
r = mail('boxes.update', {'domain': DOMAIN, 'local': 'alice', 'quotaMb': 1})
check('quota modifié', r['ok'] and r['data']['quotaMb'] == 1)
# Marge de Dovecot : le message qui fait dépasser passe, les suivants sont refusés
big = '\r\n'.join(['x' * 900] * 3500)
s = smtplib.SMTP('127.0.0.1', 25, timeout=60)
s.ehlo('dehors.example')
s.sendmail('x@dehors.example', [f'alice@{DOMAIN}'], sent('gros', 'x@dehors.example', f'alice@{DOMAIN}') + big)
s.quit()
gros = wait_subject(f'alice@{DOMAIN}', PW, 'gros', 6)
print('      gros message :', 'livré (marge large, 2.4)' if gros else 'refusé (marge 10 %, 2.3)')
s = smtplib.SMTP('127.0.0.1', 25, timeout=60)
s.ehlo('dehors.example')
s.sendmail('x@dehors.example', [f'alice@{DOMAIN}'], sent('apres', 'x@dehors.example', f'alice@{DOMAIN}'))
s.quit()
time.sleep(4)
check('quota appliqué', (gros is None) or wait_subject(f'alice@{DOMAIN}', PW, 'apres', 2) is None, sh('journalctl -u postfix --no-pager -n 6'))
m = imaplib.IMAP4_SSL('127.0.0.1', 993, ssl_context=ctx)
m.login(f'alice@{DOMAIN}', PW)
_, q = m.getquotaroot('INBOX')
m.logout()
check('quota visible en IMAP', 'STORAGE' in str(q), str(q))
r = mail('boxes.update', {'domain': DOMAIN, 'local': 'alice', 'quotaMb': 100})
sh('postqueue -f; postsuper -d ALL deferred')

# Usage rapporté
r = mail('boxes.list', {'domain': DOMAIN})
check('liste des boîtes', r['ok'] and len(r['data']['boxes']) == 2)

# Changement de mot de passe
r = mail('boxes.password', {'domain': DOMAIN, 'local': 'bob', 'password': 'Nouveau-Secret-2026!'})
check('mot de passe changé', r['ok'])
try:
    imap_subjects(f'bob@{DOMAIN}', bob_pw)
    check('ancien mot de passe refusé', False)
except imaplib.IMAP4.error:
    check('ancien mot de passe refusé', True)
check('nouveau mot de passe accepté', isinstance(imap_subjects(f'bob@{DOMAIN}', 'Nouveau-Secret-2026!'), list))

# Suspension
r = mail('boxes.update', {'domain': DOMAIN, 'local': 'bob', 'suspended': True})
check('boîte suspendue', r['ok'] and r['data']['suspended'])
time.sleep(2)
try:
    imap_subjects(f'bob@{DOMAIN}', 'Nouveau-Secret-2026!')
    check('connexion refusée si suspendue', False)
except imaplib.IMAP4.error:
    check('connexion refusée si suspendue', True)
s = smtplib.SMTP('127.0.0.1', 25, timeout=30)
s.ehlo('dehors.example')
s.docmd('MAIL FROM:<x@dehors.example>')
code, _ = s.docmd(f'RCPT TO:<bob@{DOMAIN}>')
s.quit()
check('réception refusée si suspendue (550)', code == 550, str(code))
mail('boxes.update', {'domain': DOMAIN, 'local': 'bob', 'suspended': False})

# Suppression avec conservation des données
r = mail('boxes.delete', {'domain': DOMAIN, 'local': 'bob', 'deleteData': False})
check('boîte supprimée, données conservées', r['ok'] and sh(f'ls /var/vmail/{DOMAIN}/').find('bob') >= 0)

# Arrêt / redémarrage du service
r = mail('service.set', {'enabled': False})
check('service arrêté', r['ok'] and not any(r['data']['services'].values()))
r = mail('service.set', {'enabled': True})
check('service redémarré', r['ok'] and all(r['data']['services'].values()))
check('alice toujours lisible après redémarrage', len(imap_subjects(f'alice@{DOMAIN}', PW)) >= 2)

print(f'=== {fails} échec(s) ===')
sys.exit(1 if fails else 0)
