#!/usr/bin/env python3
"""Phase 3 : alias, catch-all, redirections, répondeur, limites, quotas. VM jetable, root.
usage : mail3-boites.py <mdp-admin> [--upgrade]   (--upgrade : le service et alice existent déjà)"""
import email, email.utils, imaplib, json, smtplib, ssl, subprocess, sys, time, urllib.request, urllib.error

API = 'http://127.0.0.1:3000/api'
ADMIN = sys.argv[1]
UPGRADE = '--upgrade' in sys.argv
HOST, D = 'mail.bench.test', 'bench.test'
PW = 'Boite-De-Test-2026!'
fails = 0


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
ok = lambda r: r.get('ok') is True
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


def msg(subject, frm, to):
    return f'From: {frm}\r\nTo: {to}\r\nSubject: {subject}\r\nDate: {email.utils.formatdate()}\r\nMessage-ID: <{time.time()}@{D}>\r\n\r\nCorps\r\n'


def send_auth(user, rcpts, subject, frm=None):
    frm = frm or user
    s = smtplib.SMTP('127.0.0.1', 587, timeout=30)
    s.starttls(context=ctx)
    s.login(user, PW)
    try:
        s.sendmail(frm, rcpts, msg(subject, frm, ', '.join(rcpts)))
    finally:
        s.close()


def send_ext(rcpt, subject):
    s = smtplib.SMTP('127.0.0.1', 25, timeout=30)
    s.ehlo('dehors.example')
    try:
        s.sendmail('x@dehors.example', [rcpt], msg(subject, 'x@dehors.example', rcpt))
    finally:
        s.close()


def rcpt_code(rcpt):
    s = smtplib.SMTP('127.0.0.1', 25, timeout=30)
    s.ehlo('dehors.example')
    s.docmd('MAIL FROM:<x@dehors.example>')
    code, _ = s.docmd(f'RCPT TO:<{rcpt}>')
    s.close()
    return code


def inbox(user):
    m = imaplib.IMAP4_SSL('127.0.0.1', 993, ssl_context=ctx)
    m.login(user, PW)
    m.select('INBOX')
    _, ids = m.search(None, 'ALL')
    out = []
    for i in ids[0].split():
        _, d = m.fetch(i, '(RFC822)')
        out.append(email.message_from_bytes(d[0][1]))
    m.logout()
    return out


def has(user, subject, tries=12):
    for _ in range(tries):
        if any(e['Subject'] == subject for e in inbox(user)):
            return True
        time.sleep(1)
    return False


def lacks(user, subject):
    time.sleep(3)
    return not any(e['Subject'] == subject for e in inbox(user))


def box(local):
    return next(b for b in mail('boxes.list', {'domain': D})['data']['boxes'] if b['local'] == local)


A, B, C = f'alice@{D}', f'bob@{D}', f'carol@{D}'

if UPGRADE:
    time.sleep(1)
    deadline = time.time() + 240
    while time.time() < deadline and 'hs-mail-policy' not in str(mail('status').get('data', {}).get('services')) or not mail('status')['data']['services'].get('hs-mail-policy'):
        if time.time() > deadline:
            break
        time.sleep(5)
    st = mail('status')['data']
    check('mise à niveau automatique : 4 services actifs', all(st['services'].values()) and len(st['services']) == 4, json.dumps(st['services']))
    check('mise à niveau : anciennes boîtes intactes', len(inbox(A)) >= 1)
    check('mise à niveau : état marqué', '"configVersion": 3' in sh('cat /var/lib/homeserver-mail/state.json'))
else:
    r = mail('setup', {'hostname': HOST})
    check('setup', ok(r), json.dumps(r)[:600])
    if not ok(r):
        print(sh('journalctl -u dovecot -u hs-mail-policy -n 20 --no-pager'))
        sys.exit(1)
    check('4 services actifs', all(r['data']['services'].values()) and len(r['data']['services']) == 4, json.dumps(r['data']['services']))
    check('domaine', ok(mail('domains.add', {'domain': D, 'defaultQuotaMb': 500})))
    check('boîte alice', ok(mail('boxes.add', {'domain': D, 'local': 'alice', 'password': PW, 'displayName': ''})))
for l in ('bob', 'carol'):
    check(f'boîte {l}', ok(mail('boxes.add', {'domain': D, 'local': l, 'password': PW, 'displayName': ''})))
check('domaine externe géré', ok(mail('domains.add', {'domain': 'autre.test', 'defaultQuotaMb': 10})))

print('--- alias')
r = mail('aliases.set', {'domain': D, 'local': 'info', 'destinations': f'{A}\n{B}'})
check('alias multi-destinataires', ok(r), json.dumps(r)[:200])
send_ext(f'info@{D}', 'alias1')
check('alias : livré à alice', has(A, 'alias1'))
check('alias : livré à bob', has(B, 'alias1'))
send_auth(A, [B], 'envoi-alias', frm=f'info@{D}')
check('une boîte de destination peut envoyer sous l\'alias', has(B, 'envoi-alias'))
try:
    send_auth(C, [B], 'usurpe', frm=f'info@{D}')
    check('une autre boîte ne peut pas envoyer sous l\'alias', False)
except smtplib.SMTPException:
    check('une autre boîte ne peut pas envoyer sous l\'alias', True)
check('alias vers boîte existante refusé', not ok(mail('aliases.set', {'domain': D, 'local': 'bob', 'destinations': A})))
check('boîte sur un alias existant refusée', not ok(mail('boxes.add', {'domain': D, 'local': 'info', 'password': PW, 'displayName': ''})))
check('destination locale inexistante refusée', not ok(mail('aliases.set', {'domain': D, 'local': 'x1', 'destinations': f'fantome@{D}'})))
check('alias vers lui-même refusé', not ok(mail('aliases.set', {'domain': D, 'local': 'x2', 'destinations': f'x2@{D}'})))
check('injection par saut de ligne refusée', not ok(post('mail/aliases.set', {'domain': D, 'local': 'x3', 'destinations': ['a@b.test\nmynetworks=0.0.0.0/0']}, token)))
check('alias a1 → externe', ok(mail('aliases.set', {'domain': D, 'local': 'a1', 'destinations': f'dehors@exemple.test'})))
check('alias a2 → a1', ok(mail('aliases.set', {'domain': D, 'local': 'a2', 'destinations': f'a1@{D}'})))
check('boucle a1 → a2 → a1 refusée', not ok(mail('aliases.set', {'domain': D, 'local': 'a1', 'destinations': f'a2@{D}'})))
check('état inchangé après refus', sh(f'postmap -q a1@{D} texthash:/etc/postfix/homeserver/aliases').strip() == 'dehors@exemple.test')
check('suppression de a1', ok(mail('aliases.delete', {'domain': D, 'local': 'a1'})))
check('a2, vidé par la suppression, disparaît aussi', not any(a['local'] == 'a2' for a in mail('aliases.list', {'domain': D})['data']['aliases']))
check('alias supprimé : adresse refusée', rcpt_code(f'a1@{D}') == 550)

print('--- redirection')
r = mail('boxes.forward', {'domain': D, 'local': 'bob', 'destinations': A, 'keepCopy': False})
check('redirection sans copie', ok(r) and r['data']['forward']['keepCopy'] is False, json.dumps(r)[:200])
send_ext(B, 'fwd1')
check('redirigé vers alice', has(A, 'fwd1'))
check('pas de copie chez bob', lacks(B, 'fwd1'))
check('boucle bob → alice → bob refusée', not ok(mail('boxes.forward', {'domain': D, 'local': 'alice', 'destinations': B, 'keepCopy': True})))
r = mail('boxes.forward', {'domain': D, 'local': 'bob', 'destinations': A, 'keepCopy': True})
send_ext(B, 'fwd2')
check('avec copie : alice', has(A, 'fwd2'))
check('avec copie : bob', has(B, 'fwd2'))
check('redirection retirée', ok(mail('boxes.forward', {'domain': D, 'local': 'bob', 'destinations': '', 'keepCopy': True})) and box('bob')['forward'] is None)
send_ext(B, 'fwd3')
check('plus de redirection : bob seul', has(B, 'fwd3') and lacks(A, 'fwd3'))

print('--- catch-all')
check('sans catch-all : adresse inconnue refusée', rcpt_code(f'inconnu@{D}') == 550)
check('catch-all vers une boîte inexistante refusé', not ok(mail('catchall.set', {'domain': D, 'destination': f'fantome@{D}'})))
check('catch-all activé', ok(mail('catchall.set', {'domain': D, 'destination': A})))
send_ext(f'inconnu@{D}', 'catch1')
check('catch-all reçoit l\'inconnu', has(A, 'catch1'))
send_ext(B, 'catch2')
check('une boîte existante reçoit toujours son courrier', has(B, 'catch2') and lacks(A, 'catch2'))
send_ext(f'info@{D}', 'catch3')
check('un alias fonctionne toujours', has(B, 'catch3'))
mail('boxes.update', {'domain': D, 'local': 'carol', 'suspended': True})
time.sleep(1)
check('boîte suspendue : pas de bascule vers le catch-all', rcpt_code(C) == 550, str(rcpt_code(C)))
mail('boxes.update', {'domain': D, 'local': 'carol', 'suspended': False})
check('catch-all retiré', ok(mail('catchall.set', {'domain': D, 'destination': ''})))
check('de nouveau refusé', rcpt_code(f'inconnu@{D}') == 550)

print('--- répondeur')
weird = 'Absent "en vacances" \\ test } ; ok'
r = mail('boxes.vacation', {'domain': D, 'local': 'alice', 'enabled': True, 'subject': weird, 'message': 'Je reviens "bientôt".\nLigne 2 \\ } ; require ["fileinto"];', 'startDate': '', 'endDate': ''})
check('répondeur activé (caractères spéciaux)', ok(r), json.dumps(r)[:400])
send_auth(B, [A], 'demande1')
check('message reçu par alice', has(A, 'demande1'))
time.sleep(3)
replies = [e for e in inbox(B) if e['Subject'] == weird]
check('réponse automatique reçue, objet exact', len(replies) == 1, str([e['Subject'] for e in inbox(B)][-4:]) + sh('journalctl --no-pager -n 15 -o cat | grep -iE "sieve|vacation|denied" | tail -5'))
if replies:
    body = replies[0].get_payload(decode=True).decode('utf8', 'replace')
    check('corps intact, pas d\'injection de code', 'require ["fileinto"]' in body and 'bientôt' in body, body[:200])
    check('réponse signée DKIM', 'DKIM-Signature' in replies[0])
send_auth(B, [A], 'demande2')
check('2e message reçu', has(A, 'demande2'))
time.sleep(3)
check('pas de 2e réponse le même jour', len([e for e in inbox(B) if e['Subject'] == weird]) == 1)
r = mail('boxes.vacation', {'domain': D, 'local': 'carol', 'enabled': True, 'subject': 'futur', 'message': 'x', 'startDate': '2099-01-01', 'endDate': ''})
check('répondeur à venir enregistré', ok(r), json.dumps(r)[:300])
send_auth(B, [C], 'avant-debut')
check('avant la date : reçu', has(C, 'avant-debut'))
check('avant la date : pas de réponse', lacks(B, 'futur'))
check('dates inversées refusées', not ok(mail('boxes.vacation', {'domain': D, 'local': 'carol', 'enabled': True, 'subject': 's', 'message': 'm', 'startDate': '2030-01-02', 'endDate': '2030-01-01'})))
check('date invalide refusée', not ok(mail('boxes.vacation', {'domain': D, 'local': 'carol', 'enabled': True, 'subject': 's', 'message': 'm', 'startDate': '2030-13-40', 'endDate': ''})))
check('objet multi-lignes refusé', not ok(mail('boxes.vacation', {'domain': D, 'local': 'carol', 'enabled': True, 'subject': 'a\nb', 'message': 'm', 'startDate': '', 'endDate': ''})))
r = mail('boxes.vacation', {'domain': D, 'local': 'alice', 'enabled': False, 'subject': 's', 'message': 'm', 'startDate': '', 'endDate': ''})
check('répondeur désactivé', ok(r) and r['data']['vacation']['enabled'] is False)
check('script retiré', sh(f'ls -a /var/vmail/{D}/alice/').find('.dovecot.sieve') < 0)

print('--- limites d\'envoi')
check('limite par défaut héritée', box('alice')['effectiveSendLimit'] == 500)
E = f'dave@{D}'
check('boîte dave', ok(mail('boxes.add', {'domain': D, 'local': 'dave', 'password': PW, 'displayName': ''})))
check('limite de dave = 2', ok(mail('boxes.update', {'domain': D, 'local': 'dave', 'sendLimitPerHour': 2})) and box('dave')['effectiveSendLimit'] == 2)
time.sleep(1)
send_auth(E, [A], 'lim1')
send_auth(E, [A], 'lim2')
try:
    send_auth(E, [A], 'lim3')
    check('3e envoi bloqué', False, sh('journalctl -u hs-mail-policy -n 5 --no-pager; postconf -P | grep end_of_data'))
except smtplib.SMTPException as e:
    check('3e envoi bloqué (450)', '450' in str(e) or '4.7.1' in str(e), str(e))
check('lim3 jamais livré', lacks(A, 'lim3'))
try:
    send_auth(C, [A, B, f'info@{D}'], 'multi')
    check('carol, sans limite basse : envoi OK', True)
except smtplib.SMTPException as e:
    check('carol, sans limite basse : envoi OK', False, str(e))
mail('boxes.update', {'domain': D, 'local': 'carol', 'sendLimitPerHour': 3})
time.sleep(1)
try:
    send_auth(C, [A, B], 'multi2')
    check('destinataires comptés, pas les messages', False)
except smtplib.SMTPException:
    check('destinataires comptés, pas les messages', True)
check('sans limite (0) sur le domaine + dave null', ok(mail('domains.update', {'domain': D, 'sendLimitPerHour': 0})) and ok(mail('boxes.update', {'domain': D, 'local': 'dave', 'sendLimitPerHour': None})))
time.sleep(1)
send_auth(E, [A], 'lim-off')
check('sans limite : envoi OK', has(A, 'lim-off'))
mail('domains.update', {'domain': D, 'sendLimitPerHour': 500})
sh('systemctl stop hs-mail-policy')
time.sleep(1)
try:
    send_auth(B, [A], 'policy-off')
    check('service de limites arrêté : le courrier passe', has(A, 'policy-off'))
except smtplib.SMTPException as e:
    check('service de limites arrêté : le courrier passe', False, str(e))
sh('systemctl start hs-mail-policy'); time.sleep(3)
check('service de limites : boucle locale uniquement', '127.0.0.1:10031' in sh("ss -ltn 'sport = :10031'") and '0.0.0.0:10031' not in sh("ss -ltn 'sport = :10031'"))
check('service de limites : sans capacité', 'CapBnd:\t0000000000000000' in sh("grep CapBnd /proc/$(systemctl show -p MainPID --value hs-mail-policy)/status"), sh("grep CapBnd /proc/$(systemctl show -p MainPID --value hs-mail-policy)/status"))

print('--- quotas et limites du domaine')
b = box('alice')
check('nombre de messages rapporté', isinstance(b['messages'], int) and b['messages'] >= 3, str(b['messages']))
d = next(x for x in mail('domains.list')['data']['domains'] if x['domain'] == D)
check('usage du domaine rapporté', d['usedMb'] >= 0 and d['aliasCount'] == 1, json.dumps({k: d[k] for k in ('usedMb', 'aliasCount', 'boxCount')}))
check('nombre de boîtes limité', ok(mail('domains.update', {'domain': D, 'maxBoxes': 3})))
check('boîte de trop refusée', not ok(mail('boxes.add', {'domain': D, 'local': 'eve', 'password': PW, 'displayName': ''})))
mail('domains.update', {'domain': D, 'maxBoxes': 0})

print('--- nettoyage et suspension')
r = mail('boxes.delete', {'domain': D, 'local': 'bob', 'deleteData': True})
check('boîte supprimée', ok(r))
aliases = mail('aliases.list', {'domain': D})['data']['aliases']
check('retirée des alias', [a['destinations'] for a in aliases] == [[A]], json.dumps(aliases))
mail('domains.update', {'domain': D, 'suspended': True})
time.sleep(1)
check('domaine suspendu : alias refusé', rcpt_code(f'info@{D}') == 550)
mail('domains.update', {'domain': D, 'suspended': False})
sh('systemctl restart postfix')
time.sleep(2)
check('reprise : alias accepté', rcpt_code(f'info@{D}') == 250)

print(f'=== {fails} échec(s) ===')
sys.exit(1 if fails else 0)
