#!/usr/bin/env python3
"""Phase 5 : webmail Roundcube, de bout en bout. VM jetable, root.
usage : mail5-webmail.py <mdp-admin> [--upgrade]"""
import email, email.utils, http.cookiejar, imaplib, json, os, re, smtplib, ssl, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

API = 'http://127.0.0.1:3000/api'
ADMIN = sys.argv[1]
UPGRADE = '--upgrade' in sys.argv
HOST, D = 'mail.bench.test', 'bench.test'
BASE = f'https://{HOST}'
PW = 'Boite-De-Test-2026!'
NEW = 'Nouveau-Secret-2026!'
fails = 0


def check(label, ok, extra=''):
    global fails
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{str(extra)[:700]}]' if extra and not ok else ''), flush=True)
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
ok = lambda r: r.get('ok') is True
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def raw(url, follow=False):
    handlers = [urllib.request.HTTPSHandler(context=ctx)] + ([] if follow else [NoRedirect()])
    try:
        r = urllib.request.build_opener(*handlers).open(url, timeout=60)
        return r.status, r.read().decode(errors='replace'), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors='replace'), e.headers


class Browser:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx), urllib.request.HTTPCookieProcessor(self.jar))
        self.token = ''
        self.url = ''

    def req(self, path, data=None):
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        try:
            r = self.opener.open(urllib.request.Request(BASE + path, data=body), timeout=90)
            text, status, self.url = r.read().decode(errors='replace'), r.status, r.geturl()
        except urllib.error.HTTPError as e:
            text, status = e.read().decode(errors='replace'), e.code
        m = re.search(r'"request_token":"(\w+)"', text) or re.search(r'name="_token" value="(\w+)"', text)
        if m:
            self.token = m.group(1)
        return status, text

    def login(self, user, password):
        self.req('/')
        status, text = self.req('/?_task=login', {'_token': self.token, '_task': 'login', '_action': 'login', '_timezone': 'Europe/Paris', '_url': '', '_user': user, '_pass': password})
        return status == 200 and '"task":"mail"' in text.replace(' ', '')

    def logged_in(self):
        status, text = self.req('/?_task=mail')
        return status == 200 and '"task":"mail"' in text.replace(' ', '')

    def send(self, to, subject, message):
        _, text = self.req('/?_task=mail&_action=compose')
        cid = urllib.parse.parse_qs(urllib.parse.urlparse(self.url).query).get('_id', [''])[0]
        identity = re.search(r'<select[^>]*name="_from"[^>]*>\s*<option value="(\d+)"', text)
        return self.req('/?_task=mail&_action=send', {
            '_token': self.token, '_task': 'mail', '_action': 'send', '_id': cid, '_attachments': '', '_from': identity.group(1) if identity else '1',
            '_to': to, '_cc': '', '_bcc': '', '_replyto': '', '_followupto': '', '_subject': subject, '_message': message,
            '_is_html': '0', '_charset': 'UTF-8', '_draft': '', '_store_target': 'Sent',
        })

    def change_password(self, current, new, confirm=None):
        self.req('/?_task=settings&_action=plugin.password')
        return self.req('/?_task=settings&_action=plugin.password-save', {'_token': self.token, '_curpasswd': current, '_newpasswd': new, '_confpasswd': confirm or new})


def folder(user, password, name='INBOX'):
    m = imaplib.IMAP4_SSL('127.0.0.1', 993, ssl_context=ctx)
    m.login(user, password)
    st, _ = m.select(name)
    out = []
    if st == 'OK':
        _, ids = m.search(None, 'ALL')
        for i in ids[0].split():
            _, d = m.fetch(i, '(RFC822)')
            out.append(email.message_from_bytes(d[0][1]))
    m.logout()
    return out


def imap_ok(user, password):
    try:
        m = imaplib.IMAP4_SSL('127.0.0.1', 993, ssl_context=ctx)
        m.login(user, password)
        m.logout()
        return True
    except imaplib.IMAP4.error:
        return False


def wait_in(user, password, subject, name='INBOX', tries=20):
    for _ in range(tries):
        for e in folder(user, password, name):
            if e['Subject'] == subject:
                return e
        time.sleep(1)
    return None


def route(token_value, data, extra=None):
    req = urllib.request.Request('http://127.0.0.1:3000/api/webmail/password', data=urllib.parse.urlencode(data).encode(), method='POST',
                                 headers={'content-type': 'application/x-www-form-urlencoded', **({'x-homeserver-webmail': token_value} if token_value else {}), **(extra or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


# --- Mise en place -----------------------------------------------------------------------------------
IP = sh("ip -4 -o route get 1.1.1.1 | grep -oP 'src \\K\\S+'").strip()
with open('/etc/hosts', 'a') as f:
    f.write(f'{IP} {HOST}\n')
if not UPGRADE:
    check('activation du service', ok(mail('setup', {'hostname': HOST})))
    check('ajout du domaine', ok(mail('domains.add', {'domain': D, 'defaultQuotaMb': 500})))
    check('création alice', ok(mail('boxes.add', {'domain': D, 'local': 'alice', 'password': PW, 'displayName': 'Alice'})))
check('création bob', ok(mail('boxes.add', {'domain': D, 'local': 'bob', 'password': PW, 'displayName': 'Bob'})))
s = smtplib.SMTP('127.0.0.1', 25, timeout=30); s.ehlo('relais.exemple.org')
s.sendmail('contact@gmail.com', [f'alice@{D}'], f'From: contact@gmail.com\r\nTo: alice@{D}\r\nSubject: pour-le-webmail\r\nDate: {email.utils.formatdate()}\r\nMessage-ID: <w1@x>\r\n\r\nBonjour\r\n'.encode()); s.quit()

st = mail('status')['data']
check('statut : disponible, serveur web, désactivé', st['webmail']['available'] and st['webmail']['webServer'] and not st['webmail']['enabled'], st.get('webmail'))
web_before = sh("dpkg -l 2>/dev/null | grep -E '^ii +(apache2|nginx|libapache2-mod-php)' | awk '{print $2}'; rpm -qa 2>/dev/null | grep -E '^(httpd|nginx)-[0-9]' | sed 's/-[0-9].*//'").split()

# --- Activation --------------------------------------------------------------------------------------
r = mail('webmail.set', {'enabled': True})
check('activation du webmail', ok(r), r)
check('PHP-FPM des autres sites toujours actif', sh('systemctl list-units --no-legend --state=active "php*fpm*"').strip() != '', sh('systemctl list-units --no-legend "php*fpm*"'))
st = mail('status')['data']
check('statut : actif, adresse', st['webmail']['enabled'] and st['webmail']['active'] and st['webmail']['url'] == f'{BASE}/', st.get('webmail'))
web_after = sh("dpkg -l 2>/dev/null | grep -E '^ii +(apache2|nginx|libapache2-mod-php)' | awk '{print $2}'; rpm -qa 2>/dev/null | grep -E '^(httpd|nginx)-[0-9]' | sed 's/-[0-9].*//'").split()
check('aucun autre serveur web installé', sorted(web_before) == sorted(web_after), (web_before, web_after))
check('Apache et mod_php absents si Nginx', 'nginx' not in web_after or not any(p in web_after for p in ('apache2', 'httpd', 'libapache2-mod-php')), web_after)

status, _, headers = raw(f'http://{HOST}/foo?x=1')
check('HTTP redirigé vers HTTPS', status == 301 and headers.get('location') == f'{BASE}/foo?x=1', (status, headers.get('location')))
status, html, _ = raw(f'{BASE}/')
check('page de connexion', status == 200 and 'rcmloginuser' in html, (status, html[:300]))
check('page en français', 'lang="fr' in html, html[:200])
assets = re.findall(r'(?:href|src)="([^"]*static\.php[^"]*|[^"]*skins/elastic[^"]*\.(?:css|js)[^"]*)"', html)
status, _, _ = raw(BASE + '/' + assets[0].lstrip('./')) if assets else (0, '', None)
check('ressources statiques', status == 200, (status, assets[:2]))
for path in ('/config/config.inc.php', '/SQL/sqlite.initial.sql', '/.env', '/composer.json', '/logs/errors.log', '/temp/'):
    status, body, _ = raw(BASE + path)
    check(f'non exposé : {path}', status in (403, 404) or (status == 200 and 'rcmloginuser' in body and 'des_key' not in body), (status, body[:100]))
status, body, _ = raw(f'{BASE}/installer.php')
check('installeur non servi', status in (403, 404) and 'Installer' not in body, (status, body[:200]))
check('configuration 0640 root:homeserver-webmail', sh('stat -c "%a %U %G" /etc/homeserver-webmail/config.inc.php').strip() == '640 root homeserver-webmail', sh('stat -c "%a %U %G" /etc/homeserver-webmail/config.inc.php'))
panel_user = sh('systemctl show homeserver -p User --value').strip()
check('panel sans accès à la configuration', subprocess.run(['runuser', '-u', panel_user, '--', 'cat', '/etc/homeserver-webmail/config.inc.php'], capture_output=True).returncode != 0, panel_user)
check('base non lisible par les autres', sh('stat -c "%a" /var/lib/homeserver-webmail').strip() == '750', sh('stat -c "%a" /var/lib/homeserver-webmail'))
check('fichiers des paquets intacts', 'homeserver' not in (sh('cat /etc/roundcube/config.inc.php 2>/dev/null; cat /etc/roundcubemail/config.inc.php 2>/dev/null')))
vers = sh("ls /etc/php/ 2>/dev/null").split()
if vers:
    pools = post('php/pools.list', {'version': vers[0]}, token)
    check('pool absent de la page PHP', 'homeserver-webmail' not in json.dumps(pools), pools)

# --- Connexion et messages ---------------------------------------------------------------------------
b = Browser()
check('mauvais mot de passe refusé', not b.login(f'alice@{D}', 'mauvais-mot-de-passe'))
time.sleep(1)
b = Browser()
check('connexion', b.login(f'alice@{D}', PW), b.url)
b.req('/?_task=mail')
lst = urllib.request.Request(f'{BASE}/?_task=mail&_mbox=INBOX&_action=list&_remote=1&_page=1', headers={'X-Roundcube-Request': b.token, 'X-Requested-With': 'XMLHttpRequest'})
text = b.opener.open(lst, timeout=60).read().decode(errors='replace')
check('liste des messages', 'pour-le-webmail' in text, text[:300])
check('dossiers présents', all(x in b.req('/?_task=mail')[1] for x in ('Sent', 'Junk', 'Trash', 'Drafts')))
status, text = b.send(f'bob@{D}', 'depuis-le-webmail', 'Bonjour Bob, écrit depuis Roundcube.')
e = wait_in(f'bob@{D}', PW, 'depuis-le-webmail')
check('envoi depuis le webmail', e is not None, (status, text[:400]))
check('expéditeur correct et signé DKIM', e is not None and f'alice@{D}' in (e['From'] or '') and e['DKIM-Signature'] is not None, e and dict(e.items()))
check('copie dans Sent', wait_in(f'alice@{D}', PW, 'depuis-le-webmail', 'Sent', 5) is not None)
status, text = b.send('quelquun@gmail.com', 'vers-exterieur', 'Bonjour')
time.sleep(3)
q = sh("postqueue -j")
check('envoi vers l\'extérieur pris en charge', 'quelquun@gmail.com' in q or 'quelquun@gmail.com' in sh('journalctl -n 200 --no-pager | grep "to=<quelquun"'), q[:200])
sh('postsuper -d ALL')

# --- Changement de mot de passe ----------------------------------------------------------------------
hash_before = sh(f'grep ^bob@ /etc/dovecot/homeserver-users')
c = Browser()
check('connexion de bob', c.login(f'bob@{D}', PW))
c.change_password('mauvais-actuel-1234', NEW)
check('mauvais mot de passe actuel : rien ne change', imap_ok(f'bob@{D}', PW) and not imap_ok(f'bob@{D}', NEW))
c.change_password(PW, 'court')
check('trop court : rien ne change', imap_ok(f'bob@{D}', PW))
c.change_password(PW, NEW, 'Autre-Confirmation-2026!')
check('confirmation différente : rien ne change', imap_ok(f'bob@{D}', PW))
status, text = c.change_password(PW, NEW)
changed = False
for _ in range(3):  # Dovecot relit le fichier des comptes à la seconde près
    changed = imap_ok(f'bob@{D}', NEW)
    if changed:
        break
    time.sleep(1.2)
check('changement réel', changed, (status, text[:300], sh('journalctl -n 30 --no-pager | grep -i "password plugin" | tail -3')))
check('ancien mot de passe refusé', not imap_ok(f'bob@{D}', PW))
check('état du panel à jour', sh('grep ^bob@ /etc/dovecot/homeserver-users') != hash_before)
check('session conservée', c.logged_in(), c.url)
state = json.load(open('/var/lib/homeserver-mail/state.json'))
hash_after = state['domains'][D]['boxes']['bob']['hash']
r = mail('domains.update', {'domain': D, 'defaultQuotaMb': 600})
check('changement durable après régénération', ok(r) and imap_ok(f'bob@{D}', NEW) and json.load(open('/var/lib/homeserver-mail/state.json'))['domains'][D]['boxes']['bob']['hash'] == hash_after)
d = Browser()
check('reconnexion au webmail', d.login(f'bob@{D}', NEW))
try:
    s = smtplib.SMTP('127.0.0.1', 587, timeout=30); s.starttls(context=ctx); s.login(f'bob@{D}', NEW); s.quit()
    check('nouveau mot de passe en SMTP', True)
except smtplib.SMTPException as e:
    check('nouveau mot de passe en SMTP', False, e)

# --- Route locale ------------------------------------------------------------------------------------
secret = state['webmail']['secret']
good = {'user': f'alice@{D}', 'current': PW, 'password': 'Tentative-Refusee-2026!'}
check('route : sans jeton', route(None, good) == 403)
check('route : mauvais jeton', route('0' * 64, good) == 403)
check('route : jeton mal formé', route('../../etc', good) == 403)
check('route : mauvais mot de passe actuel', route(secret, {**good, 'current': 'pas-le-bon-mot-de-passe'}) == 403)
check('route : relayée par un proxy', route(secret, good, {'x-forwarded-for': '203.0.113.9'}) == 403)
check('route : mot de passe trop court', route(secret, {**good, 'password': 'court'}) == 403)
check('route : boîte inconnue', route(secret, {**good, 'user': f'personne@{D}'}) == 403)
check('route : injection refusée', route(secret, {**good, 'password': 'Tentative-Refusee\n2026!x'}) == 403)
check('alice inchangée', imap_ok(f'alice@{D}', PW))
check('route : aucun mot de passe journalisé', 'Tentative-Refusee' not in sh('journalctl -n 500 --no-pager'))
if '0.0.0.0' in sh('ss -ltn | grep :3000'):
    try:
        req = urllib.request.Request(f'http://{IP}:3000/api/webmail/password', data=urllib.parse.urlencode(good).encode(), method='POST',
                                     headers={'content-type': 'application/x-www-form-urlencoded', 'x-homeserver-webmail': secret})
        code = urllib.request.urlopen(req, timeout=30).status
    except urllib.error.HTTPError as e:
        code = e.code
    check('route : refusée hors boucle locale', code == 403, code)
status, _, _ = raw(f'{BASE}/api/webmail/password')
check('route : non servie par le site du webmail', status in (301, 302, 404, 405) or status == 200, status)
r = mail('boxes.update', {'domain': D, 'local': 'bob', 'suspended': True})
check('boîte suspendue : connexion refusée', ok(r) and not Browser().login(f'bob@{D}', NEW), r)
mail('boxes.update', {'domain': D, 'local': 'bob', 'suspended': False})

# --- Fail2ban ----------------------------------------------------------------------------------------
time.sleep(2)
check('jail roundcube-auth active', 'roundcube-auth' in sh('fail2ban-client status'), sh('fail2ban-client status'))
check('échecs du webmail visibles par sa jail', 'mauvais' not in '' and sh('journalctl -t roundcube -n 50 --no-pager | grep -c -iE "failed login|login failed"').strip() not in ('', '0'), sh('journalctl -t roundcube -n 10 --no-pager'))

# --- Désactivation -----------------------------------------------------------------------------------
r = mail('webmail.set', {'enabled': False})
check('désactivation', ok(r) and not r['data']['webmail']['enabled'], r)
try:
    status, body, _ = raw(f'{BASE}/')
except OSError:  # plus rien en HTTPS sur ce port : c'est bien retiré
    status, body = 0, ''
check('site retiré', 'rcmloginuser' not in body, (status, body[:150]))
check('mail toujours fonctionnel', imap_ok(f'alice@{D}', PW))
r = mail('webmail.set', {'enabled': True})
check('réactivation', ok(r), r)
e2 = Browser()
check('réactivation : connexion', e2.login(f'alice@{D}', PW))
check('secret et clé stables', json.load(open('/var/lib/homeserver-mail/state.json'))['webmail']['secret'] == secret)

print(f'FIN : {fails} échec(s)')
sys.exit(1 if fails else 0)
