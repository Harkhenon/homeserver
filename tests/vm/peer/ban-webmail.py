#!/usr/bin/env python3
"""Depuis la VM voisine (tests/vm/run.sh --peer). usage : ban-webmail.py <ip> login|probe — connexions ratées au webmail."""
import http.cookiejar, re, socket, ssl, sys, urllib.parse, urllib.request
IP, MODE = sys.argv[1], sys.argv[2]
HOST = 'mail.bench.test'
with open('/etc/hosts') as f:
    known = HOST in f.read()
if not known:
    with open('/etc/hosts', 'a') as f:
        f.write(f'{IP} {HOST}\n')
else:
    lines = [l for l in open('/etc/hosts') if HOST not in l] + [f'{IP} {HOST}\n']
    open('/etc/hosts', 'w').writelines(lines)
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE


def reachable():
    try:
        socket.create_connection((IP, 443), timeout=5).close()
        return True
    except OSError:
        return False


if MODE == 'probe':
    print('443:', reachable())
    sys.exit(0)
for i in range(8):
    try:
        o = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        t = o.open(f'https://{HOST}/', timeout=15).read().decode(errors='replace')
        tok = re.search(r'"request_token":"(\w+)"', t).group(1)
        o.open(urllib.request.Request(f'https://{HOST}/?_task=login', data=urllib.parse.urlencode({'_token': tok, '_task': 'login', '_action': 'login', '_timezone': 'UTC', '_url': '', '_user': 'alice@bench.test', '_pass': 'mauvais-mot-de-passe'}).encode()), timeout=20).read()
    except urllib.error.HTTPError as e:
        print('http', e.code, end=' ')
    except OSError as e:
        print('coupé à', i, e)
        break
