#!/usr/bin/env python3
"""Depuis la VM voisine (tests/vm/run.sh --peer). usage : ban-mail.py <ip> ok|smtp|smtp465|imap|rcpt"""
import imaplib, smtplib, socket, ssl, sys

IP, MODE = sys.argv[1], sys.argv[2]
U, PW = 'alice@bench.test', 'Boite-De-Test-2026!'
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE


def reachable(port):
    try:
        socket.create_connection((IP, port), timeout=5).close()
        return True
    except OSError:
        return False


if MODE == 'probe':
    print('587:', reachable(587))
    sys.exit(0)
if MODE == 'ok':
    # Client réel hors mynetworks, HELO court, sans rien de suspect
    s = smtplib.SMTP(IP, 587, timeout=30); s.ehlo('poste'); s.starttls(context=ctx); s.ehlo('poste'); s.login(U, PW)
    s.sendmail(U, ['bob@bench.test'], f'From: {U}\r\nTo: bob@bench.test\r\nSubject: depuis-le-pair\r\n\r\nx\r\n'.encode()); s.quit()
    s = smtplib.SMTP_SSL(IP, 465, timeout=30, context=ctx); s.ehlo('poste'); s.login(U, PW); s.quit()
    print('envoi 587 et connexion 465 : OK')
elif MODE in ('smtp', 'smtp465'):
    for i in range(8):
        try:
            if MODE == 'smtp':
                s = smtplib.SMTP(IP, 587, timeout=15); s.ehlo('poste'); s.starttls(context=ctx); s.ehlo('poste')
            else:
                s = smtplib.SMTP_SSL(IP, 465, timeout=15, context=ctx); s.ehlo('poste')
            try:
                s.login(U, 'mauvais-mot-de-passe')
            except smtplib.SMTPAuthenticationError:
                pass
            s.close()
        except OSError as e:
            print('coupé à', i, e); break
elif MODE == 'imap':
    for i in range(8):
        try:
            m = imaplib.IMAP4_SSL(IP, 993, ssl_context=ctx, timeout=30)
            try:
                m.login(U, 'mauvais-mot-de-passe')
            except imaplib.IMAP4.error:
                pass
            m.shutdown()
        except OSError as e:
            print('coupé à', i, e); break
elif MODE == 'rcpt':
    for i in range(12):
        try:
            s = smtplib.SMTP(IP, 25, timeout=15); s.ehlo('relais.exemple.org')
            s.docmd('MAIL FROM:<contact@gmail.com>')
            print(s.docmd(f'RCPT TO:<quelquun{i}@gmail.com>')[0], end=' ')
            s.close()
        except OSError as e:
            print('coupé à', i, e); break
print('joignable 993 :', reachable(993))
