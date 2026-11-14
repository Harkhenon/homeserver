#!/usr/bin/env python3
"""Prépare ce serveur comme relais de test : autre nom d'hôte, compte d'envoi, boîte destinataire."""
import json, subprocess, sys, urllib.request
ADMIN = sys.argv[1]


def post(path, body=None, token=None):
    req = urllib.request.Request(f'http://127.0.0.1:3000/api/{path}', data=json.dumps(body or {}).encode(), method='POST',
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)


t = post('auth/login', {'username': 'admin', 'password': ADMIN})['token']
print(post('mail/setup', {'hostname': 'mail2.relay.test'}, t).get('ok'))
print(post('mail/domains.add', {'domain': 'relay.test', 'defaultQuotaMb': 50}, t).get('ok'))
print(post('mail/boxes.add', {'domain': 'relay.test', 'local': 'compte', 'password': 'Relais-De-Test-2026!', 'displayName': ''}, t).get('ok'))
print(post('mail/boxes.add', {'domain': 'relay.test', 'local': 'dest', 'password': 'Boite-De-Test-2026!', 'displayName': ''}, t).get('ok'))
# Un vrai relais accepte les expéditeurs de ses clients : ici le compte relaie pour bench.test
subprocess.run(['postconf', '-P', '587/inet/smtpd_sender_restrictions='], check=True)
subprocess.run(['postfix', 'reload'], check=True)
