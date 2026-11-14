#!/usr/bin/env python3
"""Phase 4 : antispam, pare-feu, file d'attente, journaux, sauvegardes. VM jetable, root.
usage : mail4-protection.py <mdp-admin> [--upgrade] [--clamav] [--no-rspamd]"""
import base64, email, email.utils, glob, imaplib, io, json, os, smtplib, ssl, subprocess, sys, tarfile, time, urllib.request, urllib.error
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

API = 'http://127.0.0.1:3000/api'
ADMIN = sys.argv[1]
UPGRADE = '--upgrade' in sys.argv
CLAMAV = '--clamav' in sys.argv
EXPECT_RSPAMD = '--no-rspamd' not in sys.argv
HOST, D = 'mail.bench.test', 'bench.test'
PW = 'Boite-De-Test-2026!'
BK = '/var/backups/homeserver/mail'
fails = 0


def check(label, ok, extra=''):
    global fails
    print(('PASS  ' if ok else 'FAIL  ') + label + (f'  [{str(extra)[:600]}]' if extra and not ok else ''), flush=True)
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
data = lambda r: r.get('data', r.get('result', r))
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


IP = sh("ip -4 -o route get 1.1.1.1 | grep -oP 'src \\K\\S+'").strip() or sh('hostname -I').split()[0]


def msg(subject, frm, to, body='Bonjour,\r\n\r\nUn message tout à fait ordinaire pour ce test de messagerie.\r\n'):
    return f'From: {frm}\r\nTo: {to}\r\nSubject: {subject}\r\nDate: {email.utils.formatdate()}\r\nMessage-ID: <{time.time()}@{D}>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}'.encode()


def send_auth(user, rcpts, subject, body=None):
    s = smtplib.SMTP(IP, 587, timeout=60)
    s.ehlo('poste')  # nom court : le HELO strict ne vise pas les clients authentifiés
    s.starttls(context=ctx)
    s.ehlo('poste')
    s.login(user, PW)
    try:
        s.sendmail(user, rcpts, msg(subject, user, ', '.join(rcpts)) if body is None else body)
    finally:
        s.close()


def ext_codes(helo, sender, rcpt):
    """Port 25 depuis l'IP de la machine : hors mynetworks, comme un serveur extérieur."""
    s = smtplib.SMTP(IP, 25, timeout=60)
    code_h, _ = s.docmd(f'EHLO {helo}')
    code_m, _ = s.docmd(f'MAIL FROM:<{sender}>')
    code_r, text = s.docmd(f'RCPT TO:<{rcpt}>')
    s.close()
    return code_h, code_m, code_r, text.decode(errors='replace')


def send_ext(rcpt, subject, body=None, frm='contact@gmail.com'):
    s = smtplib.SMTP(IP, 25, timeout=120)
    s.ehlo(HOST.replace('mail.', 'relais.'))
    try:
        s.sendmail(frm, [rcpt], msg(subject, frm, rcpt) if body is None else body)
        return 250, ''
    except smtplib.SMTPDataError as e:
        return e.smtp_code, e.smtp_error.decode(errors='replace')
    except smtplib.SMTPRecipientsRefused as e:
        c = list(e.recipients.values())[0]
        return c[0], c[1].decode(errors='replace')
    except smtplib.SMTPSenderRefused as e:
        return e.smtp_code, e.smtp_error.decode(errors='replace')
    finally:
        s.close()


def folder(user, name='INBOX', password=PW):
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


def wait_in(user, subject, name='INBOX', tries=15):
    for _ in range(tries):
        for e in folder(user, name):
            if e['Subject'] == subject:
                return e
        time.sleep(1)
    return None


def active(unit):
    return sh(f'systemctl is-active {unit}').strip() == 'active'


def pc(k):
    return sh(f'postconf -h {k}').strip()


def pm(port, k):
    return sh(f'postconf -P -h {port}/inet/{k}').strip()


# --- Mise en place -----------------------------------------------------------------------------------
if not UPGRADE:
    r = mail('setup', {'hostname': HOST})
    check('activation du service', ok(r), r)
    r = mail('domains.add', {'domain': D, 'defaultQuotaMb': 500})
    check('ajout du domaine', ok(r), r)
    r = mail('boxes.add', {'domain': D, 'local': 'alice', 'password': PW, 'displayName': 'Alice'})
    check('création alice', ok(r), r)
r = mail('boxes.add', {'domain': D, 'local': 'bob', 'password': PW, 'displayName': 'Bob'})
check('création bob', ok(r), r)
r = mail('aliases.set', {'domain': D, 'local': 'contact', 'destinations': [f'alice@{D}']})
check('création alias', ok(r), r)

st = data(mail('status'))
check('statut : antispam par défaut', st.get('antispam', {}).get('engine') == 'basic' and st['antispam']['rbl'] is True, st.get('antispam'))
check('statut : horloge renseignée', 'clockSynced' in st and st['clockSynced'] is not None, st.get('clockSynced'))
check('statut : mémoire renseignée', st.get('memoryMb', 0) > 500, st.get('memoryMb'))
check(f'statut : Rspamd {"disponible" if EXPECT_RSPAMD else "indisponible"}', st.get('rspamdAvailable') is EXPECT_RSPAMD, st.get('rspamdAvailable'))
check('configuration en version 4', json.load(open('/var/lib/homeserver-mail/state.json')).get('configVersion') == 4)

# --- Contrôles de base -------------------------------------------------------------------------------
check('Postfix : listes noires', 'zen.spamhaus.org=127.0.0.[2..11]' in pc('smtpd_recipient_restrictions'), pc('smtpd_recipient_restrictions'))
check('Postfix : refus de relais conservé', 'reject_unauth_destination' in pc('smtpd_relay_restrictions'), pc('smtpd_relay_restrictions'))
for p in ('587', '465'):
    check(f'{p} : pas de listes noires', pm(p, 'smtpd_recipient_restrictions') == 'permit_sasl_authenticated,reject', pm(p, 'smtpd_recipient_restrictions'))
check('postfix check sans erreur', subprocess.run('postfix check', shell=True, capture_output=True).returncode == 0)
_, _, code, text = ext_codes('nom-sans-point', 'contact@gmail.com', f'alice@{D}')
check('HELO sans domaine refusé', code >= 500, (code, text))
_, code_m, code_r, text = ext_codes('relais.exemple.org', 'x@domaine-inexistant.invalid', f'alice@{D}')
check('expéditeur inexistant refusé', code_m >= 400 or code_r >= 400, (code_m, code_r, text))
_, code_m, code_r, text = ext_codes('relais.exemple.org', 'sansdomaine', f'alice@{D}')
check('expéditeur sans domaine refusé', code_m >= 400 or code_r >= 400, (code_m, code_r, text))
_, _, code, text = ext_codes('relais.exemple.org', 'contact@gmail.com', 'quelquun@gmail.com')
check('relais ouvert toujours refusé', code >= 500, (code, text))
_, _, code, text = ext_codes('relais.exemple.org', 'contact@gmail.com', f'nimporte@{D}')
check('destinataire inconnu refusé', code >= 500, (code, text))
code, text = send_ext(f'alice@{D}', 'externe-accepte')
check('message extérieur correct accepté', code == 250 and wait_in(f'alice@{D}', 'externe-accepte') is not None, (code, text))
send_auth(f'alice@{D}', [f'bob@{D}'], 'envoi-authentifie')
e = wait_in(f'bob@{D}', 'envoi-authentifie')
check('envoi authentifié avec HELO court', e is not None)
check('envoi authentifié signé DKIM', e is not None and e['DKIM-Signature'] is not None)

base = {'engine': 'basic', 'rbl': False, 'strictSender': False, 'junkScore': 6, 'rejectScore': 15, 'clamav': False}
r = mail('antispam.set', base)
check('désactivation des contrôles', ok(r), r)
check('listes noires retirées', 'spamhaus' not in pc('smtpd_recipient_restrictions'), pc('smtpd_recipient_restrictions'))
_, code_m, code_r, text = ext_codes('nom-sans-point', 'x@domaine-inexistant.invalid', f'alice@{D}')
check('contrôles retirés : accepté', code_m < 400 and code_r < 400, (code_m, code_r, text))
_, _, code, text = ext_codes('relais.exemple.org', 'contact@gmail.com', 'quelquun@gmail.com')
check('contrôles retirés : relais toujours refusé', code >= 500, (code, text))
r = mail('antispam.set', {**base, 'rbl': True, 'strictSender': True})
check('réactivation des contrôles', ok(r), r)
r = mail('antispam.set', {**base, 'junkScore': 20, 'rejectScore': 10})
check('scores incohérents refusés', not ok(r), r)
r = mail('antispam.set', {**base, 'clamav': True})
check('ClamAV sans Rspamd refusé', not ok(r), r)
if not EXPECT_RSPAMD:
    r = mail('antispam.set', {**base, 'engine': 'rspamd'})
    check('Rspamd indisponible : refus clair', not ok(r) and 'disponible' in json.dumps(r, ensure_ascii=False), r)

# --- Pare-feu ----------------------------------------------------------------------------------------
ufw = sh('ufw status 2>/dev/null').startswith('Status: active')
fwd = sh('firewall-cmd --state 2>/dev/null').strip() == 'running'
fw_list = (lambda: sh('ufw status')) if ufw else (lambda: sh('firewall-cmd --list-ports'))
if ufw or fwd:
    check('pare-feu : ports ouverts', '587' in fw_list() and '993' in fw_list(), fw_list())
    r = mail('service.set', {'enabled': False})
    check('arrêt du service', ok(r), r)
    check('arrêt : services stoppés', not active('postfix') and not active('dovecot'))
    check('arrêt : ports fermés', '587' not in fw_list() and '993' not in fw_list(), fw_list())
    r = mail('service.set', {'enabled': True})
    check('redémarrage du service', ok(r), r)
    check('redémarrage : ports rouverts', '587' in fw_list() and '993' in fw_list(), fw_list())
    time.sleep(3)
else:
    print('INFO  pas de pare-feu actif : test ignoré')

# --- File d'attente ----------------------------------------------------------------------------------
sh('postconf -e defer_transports=smtp; postfix reload')
time.sleep(1)
for i in range(3):
    send_auth(f'alice@{D}', [f'dehors{i}@gmail.com'], f'file-{i}')
time.sleep(4)
q = data(mail('queue.list'))
check('file : 3 messages', q.get('total') == 3, q)
ids = [m['id'] for m in q.get('items', [])]
first = q['items'][0] if q.get('items') else {}
check('file : détails', first.get('sender') == f'alice@{D}' and first.get('recipients') and first.get('arrivalAt') and first.get('sizeBytes', 0) > 0, first)
if len(ids) == 3:
    q = data(mail('queue.action', {'action': 'hold', 'id': ids[0]}))
    check('file : retenir', next((m for m in q['items'] if m['id'] == ids[0]), {}).get('queue') == 'hold', q)
    q = data(mail('queue.action', {'action': 'release', 'id': ids[0]}))
    check('file : libérer', next((m for m in q['items'] if m['id'] == ids[0]), {}).get('queue') != 'hold', q)
    r = mail('queue.action', {'action': 'retry', 'id': ids[1]})
    check('file : relancer', ok(r), r)
    r = mail('queue.action', {'action': 'flush'})
    check('file : tout relancer', ok(r), r)
    q = data(mail('queue.action', {'action': 'delete', 'id': ids[2]}))
    check('file : supprimer un', q.get('total') == 2, q)
    r = mail('queue.action', {'action': 'delete', 'id': '../../etc'})
    check('file : identifiant invalide refusé', not ok(r), r)
    r = mail('queue.action', {'action': 'purge'})
    check('file : action inconnue refusée', not ok(r), r)
    q = data(mail('queue.action', {'action': 'delete'}))
    check('file : tout supprimer', q.get('total') == 0, q)
sh('postconf -X defer_transports; postfix reload')

# --- Journaux ----------------------------------------------------------------------------------------
send_auth(f'alice@{D}', [f'bob@{D}'], 'pour-le-journal')
wait_in(f'bob@{D}', 'pour-le-journal')
time.sleep(2)
lines = data(mail('logs', {'limit': 2000})).get('lines', [])
check('journal : lignes du courrier', any('postfix/' in l for l in lines) and any('dovecot' in l for l in lines), lines[-5:])
check('journal : rien d\'étranger', not any(' sshd' in l or ' systemd[' in l or ' kernel:' in l for l in lines), [l for l in lines if ' sshd' in l][:3])
lines = data(mail('logs', {'query': f'bob@{D}', 'limit': 2000})).get('lines', [])
check('journal : filtre par adresse', any(f'to=<bob@{D}>' in l for l in lines), lines[-5:])
check('journal : lignes liées au message', any('message-id=' in l or 'qmgr' in l or 'cleanup' in l for l in lines), lines[-5:])
check('journal : limite respectée', len(data(mail('logs', {'limit': 5})).get('lines', [])) <= 5)
check('journal : texte absent', data(mail('logs', {'query': 'zzz-introuvable-zzz', 'limit': 10})).get('lines') == [])

# --- Sauvegardes -------------------------------------------------------------------------------------
send_auth(f'alice@{D}', [f'bob@{D}'], 'avant-sauvegarde')
check('sauvegarde : message présent', wait_in(f'bob@{D}', 'avant-sauvegarde') is not None)
r = mail('backups.create', {'domain': D, 'local': 'bob'})
check('sauvegarde d\'une boîte', ok(r), r)
box_file = data(r).get('file', '')
time.sleep(1.1)
key_before = sh(f'cat /etc/opendkim/keys/{D}/* | sha256sum')
r = mail('backups.create', {'domain': D})
check('sauvegarde d\'un domaine', ok(r), r)
dom_file = data(r).get('file', '')
listed = [b['file'] for b in data(mail('backups.list')).get('backups', [])]
check('sauvegardes listées', box_file in listed and dom_file in listed, listed)
check('dossier 0700, archive 0600', oct(os.stat(BK).st_mode)[-3:] == '700' and oct(os.stat(f'{BK}/{dom_file}').st_mode)[-3:] == '600')
check('pas de méta laissée', not os.path.exists(f'{BK}/homeserver-mail-meta.json'))

# Boîte supprimée, puis restaurée
r = mail('boxes.delete', {'domain': D, 'local': 'bob', 'deleteData': True})
check('suppression de bob', ok(r), r)
r = mail('backups.restore', {'file': box_file})
check('restauration de la boîte', ok(r) and 'bob' in data(r).get('recreatedBoxes', []), r)
try:
    check('bob : ancien mot de passe et messages', any(e['Subject'] == 'avant-sauvegarde' for e in folder(f'bob@{D}')))
except Exception as e:
    check('bob : ancien mot de passe et messages', False, e)
check('bob : propriétaire vmail', sh(f"stat -c %U /var/vmail/{D}/bob").strip() == 'vmail')
send_auth(f'alice@{D}', [f'bob@{D}'], 'apres-restauration')
check('bob : reçoit de nouveau', wait_in(f'bob@{D}', 'apres-restauration') is not None)

# Boîte existante : rien n'est écrasé, messages fusionnés sans doublon
r = mail('boxes.password', {'domain': D, 'local': 'bob', 'password': 'Nouveau-Secret-2026!'})
check('changement du mot de passe de bob', ok(r), r)
r = mail('backups.restore', {'file': box_file})
check('restauration sur boîte existante', ok(r) and data(r).get('recreatedBoxes') == [], r)
msgs = folder(f'bob@{D}', password='Nouveau-Secret-2026!')
check('mot de passe actuel conservé, nouveaux messages gardés', any(e['Subject'] == 'apres-restauration' for e in msgs))
check('pas de doublon', sum(1 for e in msgs if e['Subject'] == 'avant-sauvegarde') == 1, [e['Subject'] for e in msgs])
r = mail('boxes.password', {'domain': D, 'local': 'bob', 'password': PW})

# Domaine supprimé, puis restauré
r = mail('domains.delete', {'domain': D, 'deleteData': True})
check('suppression du domaine', ok(r), r)
check('domaine effacé du disque', not os.path.exists(f'/var/vmail/{D}'))
r = mail('backups.restore', {'file': dom_file})
check('restauration du domaine', ok(r), r)
check('clé DKIM identique', sh(f'cat /etc/opendkim/keys/{D}/* | sha256sum') == key_before)
check('propriétaire de la clé', sh(f"stat -c %U /etc/opendkim/keys/{D}/* | sort -u").strip() == 'opendkim', sh(f"ls -l /etc/opendkim/keys/{D}/"))
try:
    check('domaine : messages revenus', any(e['Subject'] == 'avant-sauvegarde' for e in folder(f'bob@{D}')))
except Exception as e:
    check('domaine : messages revenus', False, e)
check('domaine : alias revenu', any(a['local'] == 'contact' for a in data(mail('aliases.list', {'domain': D})).get('aliases', [])))
send_auth(f'alice@{D}', [f'bob@{D}'], 'dkim-apres-restauration')
e = wait_in(f'bob@{D}', 'dkim-apres-restauration')
check('domaine : envoi signé après restauration', e is not None and e['DKIM-Signature'] is not None)


# Archives hostiles
def evil(name, entries, meta=None):
    with tarfile.open(f'{BK}/{name}', 'w:gz') as t:
        for n, kind, target in entries:
            ti = tarfile.TarInfo(n)
            if kind == 'file':
                ti.size = 4
                t.addfile(ti, io.BytesIO(b'evil'))
            else:
                ti.type = tarfile.SYMTYPE
                ti.linkname = target
                t.addfile(ti)
        raw = json.dumps(meta or {'kind': 'domain', 'domain': D, 'state': {}, 'dkim': {}}).encode()
        ti = tarfile.TarInfo('homeserver-mail-meta.json')
        ti.size = len(raw)
        t.addfile(ti, io.BytesIO(raw))


CASES = [
    ('évasion par ..', f'mail-{D}-20260101T000001.tar.gz', [(f'../../../tmp/evil-a', 'file', None)], None),
    ('chemin absolu', f'mail-{D}-20260101T000002.tar.gz', [('/tmp/evil-b', 'file', None)], None),
    ('autre domaine', f'mail-{D}-20260101T000003.tar.gz', [('autre.test/alice/x', 'file', None)], None),
    ('lien vers /etc', f'mail-{D}-20260101T000004.tar.gz', [(f'{D}/alice/lien', 'sym', '/etc')], None),
    ('faux lien sieve', f'mail-{D}-20260101T000005.tar.gz', [(f'{D}/alice/.dovecot.sieve', 'sym', '/etc/shadow')], None),
    ('boîte voisine', f'mail-{D}+bob-20260101T000006.tar.gz', [(f'{D}/alice/x', 'file', None)], {'kind': 'box', 'domain': D, 'local': 'bob', 'box': {}}),
    ('méta d\'un autre domaine', f'mail-{D}-20260101T000007.tar.gz', [(f'{D}/alice/y', 'file', None)], {'kind': 'domain', 'domain': 'autre.test', 'state': {}, 'dkim': {}}),
]
for label, name, entries, meta in CASES:
    evil(name, entries, meta)
    r = mail('backups.restore', {'file': name})
    check(f'archive refusée : {label}', not ok(r), r)
    os.remove(f'{BK}/{name}')
check('aucun fichier échappé', not glob.glob('/tmp/evil-*') and not os.path.exists(f'/var/vmail/{D}/alice/y'))
r = mail('backups.restore', {'file': '../../../etc/passwd'})
check('nom de fichier invalide refusé', not ok(r), r)
r = mail('backups.delete', {'file': box_file})
check('suppression d\'une sauvegarde', ok(r) and not os.path.exists(f'{BK}/{box_file}'), r)
r = mail('backups.delete', {'file': '../state.json'})
check('suppression hors dossier refusée', not ok(r), r)

# --- Rspamd ------------------------------------------------------------------------------------------
if EXPECT_RSPAMD:
    cfg = {'engine': 'rspamd', 'rbl': True, 'strictSender': True, 'junkScore': 6, 'rejectScore': 15, 'clamav': False}
    r = mail('antispam.set', cfg)
    check('activation de Rspamd', ok(r), r)
    check('rspamd et redis actifs', active('rspamd') and (active('redis-server') or active('redis')))
    check('milter branché', '11332' in pc('smtpd_milters'), pc('smtpd_milters'))
    check('milter non bloquant', pc('milter_default_action') == 'accept', pc('milter_default_action'))
    st = data(mail('status'))
    check('statut : rspamd dans les services', st['services'].get('rspamd') is True and st['antispam']['engine'] == 'rspamd', st.get('services'))
    time.sleep(8)
    check('rspamd : écoute locale uniquement', '127.0.0.1:11332' in sh('ss -ltn') and '0.0.0.0:11332' not in sh('ss -ltn'), sh('ss -ltn | grep 113'))
    check('rspamd : pas d\'interface ouverte', ':11334' not in sh('ss -ltn'), sh('ss -ltn | grep 113'))
    GTUBE = 'XJS*C4JDBQADN1.NSBN3*2IDNEN*GTUBE-STANDARD-ANTI-UBE-TEST-EMAIL*C.34X'
    ADDH = 'YJS*C4JDBQADN1.NSBN3*2IDNEN*GTUBE-STANDARD-ANTI-UBE-TEST-EMAIL*C.34X'
    code, text = send_ext(f'alice@{D}', 'gtube-rejet', msg('gtube-rejet', 'contact@gmail.com', f'alice@{D}', GTUBE + '\r\n'))
    check('GTUBE refusé à la réception', code >= 500, (code, text))
    code, text = send_ext(f'alice@{D}', 'gtube-junk', msg('gtube-junk', 'contact@gmail.com', f'alice@{D}', ADDH + '\r\n'))
    e = wait_in(f'alice@{D}', 'gtube-junk', 'Junk') if code == 250 else None
    check('indésirable classé dans Junk', e is not None and e['X-Spam'] == 'Yes', (code, text, e and dict(e.items())))
    check('indésirable absent de la boîte', not any(m['Subject'] == 'gtube-junk' for m in folder(f'alice@{D}')))
    send_auth(f'alice@{D}', [f'bob@{D}'], 'normal-rspamd')
    e = wait_in(f'bob@{D}', 'normal-rspamd')
    check('message normal dans INBOX, signé', e is not None and e['DKIM-Signature'] is not None and len(e.get_all('DKIM-Signature')) == 1, e and e.get_all('DKIM-Signature'))
    sh('systemctl stop rspamd')
    time.sleep(1)
    send_auth(f'alice@{D}', [f'bob@{D}'], 'rspamd-en-panne')
    check('Rspamd en panne : le courrier passe', wait_in(f'bob@{D}', 'rspamd-en-panne') is not None)
    sh('systemctl start rspamd')
    if CLAMAV:
        r = mail('antispam.set', {**cfg, 'clamav': True})
        check('activation de ClamAV', ok(r), r)
        for _ in range(60):
            if os.path.exists('/run/clamav/clamd.ctl'):
                break
            time.sleep(10)
        check('clamd démarré avec sa base', os.path.exists('/run/clamav/clamd.ctl'), sh('systemctl status clamav-daemon --no-pager | tail -5'))
        m = MIMEMultipart()
        m['From'], m['To'], m['Subject'] = 'contact@gmail.com', f'alice@{D}', 'virus'
        m['Date'], m['Message-ID'] = email.utils.formatdate(), f'<{time.time()}@x>'
        m.attach(MIMEText('Voir la pièce jointe.'))
        a = MIMEApplication(base64.b64decode('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo='))
        a.add_header('Content-Disposition', 'attachment', filename='eicar.com')
        m.attach(a)
        code, text = send_ext(f'alice@{D}', 'virus', m.as_bytes())
        check('EICAR refusé', code >= 500, (code, text))
        r = mail('antispam.set', cfg)
        check('retrait de ClamAV', ok(r), r)
        check('clamd arrêté', not active('clamav-daemon'))
    r = mail('antispam.set', {**cfg, 'engine': 'basic'})
    check('retour à l\'antispam de base', ok(r), r)
    check('rspamd arrêté, milter retiré', not active('rspamd') and '11332' not in pc('smtpd_milters'), pc('smtpd_milters'))
    send_auth(f'alice@{D}', [f'bob@{D}'], 'sans-rspamd')
    check('courrier sans Rspamd', wait_in(f'bob@{D}', 'sans-rspamd') is not None)

# --- Fail2ban ----------------------------------------------------------------------------------------
if sh('command -v fail2ban-client').strip():
    jails = sh('fail2ban-client status')
    for j in ('postfix', 'postfix-sasl', 'dovecot'):
        check(f'jail {j} active', j in jails, jails)
    check('IP du serveur jamais bannie', IP in sh('grep ^ignoreip /etc/fail2ban/jail.d/homeserver.conf'), sh('grep ^ignoreip /etc/fail2ban/jail.d/homeserver.conf'))
else:
    check('fail2ban installé', False)

print(f'FIN : {fails} échec(s)')
sys.exit(1 if fails else 0)
