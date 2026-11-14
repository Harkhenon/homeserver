#!/usr/bin/env bash
# Côté VM (root) : installe le panel puis lance une suite. Copié dans /tmp par tests/vm/run.sh.
#
#   vm-run.sh <suite.py> [--upgrade] [--web apache|nginx] [--dns-local] [--firewall] [-- <arguments de la suite>]
#
#   --upgrade     installe d'abord /tmp/base.tar.gz (version de référence), active le mail avec
#                 alice@bench.test, puis redéploie /tmp/src.tar.gz : la suite reçoit --upgrade
#   --web         serveur web installé par l'installeur (défaut : apache)
#   --dns-local   les vérifications DNS du panel interrogent le Bind local, outils DKIM installés
#   --firewall    active ufw ou firewalld (installé au besoin) avant la suite
#
# Une installation précédente est désinstallée avec --purge : la VM peut resservir.
set -u
SUITE="${1:?suite requise}"; shift
UPGRADE=false; WEB=apache; DNS_LOCAL=false; FIREWALL=false; ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --upgrade) UPGRADE=true ;;
    --web) WEB="${2:?apache|nginx}"; shift ;;
    --dns-local) DNS_LOCAL=true ;;
    --firewall) FIREWALL=true ;;
    --) shift; ARGS=("$@"); break ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done

say() { echo "-- $*"; }
strip() { sed 's/\x1b\[[0-9;]*m//g'; }

install_from() { # archive
  rm -rf /root/homeserver && mkdir /root/homeserver
  tar xzf "$1" -C /root/homeserver --strip-components=1 2>/dev/null
  (cd /root/homeserver && HS_WEB_SERVER="$WEB" HS_PHP_VERSION=none HS_INSTALL_EXTRAS=yes bash scripts/install.sh --yes > /root/install.log 2>&1)
  local rc=$?
  say "installation de $(basename "$1") : code $rc"
  strip < /root/install.log | grep -E "✗" | cut -c1-200
  strip < /root/install.log | grep -oP "Admin\s*: admin / \K\S+" > /root/admin-pw
  [ "$rc" -eq 0 ] && [ -s /root/admin-pw ]
}

api() { # chemin json
  python3 - "$1" "$2" <<'PY'
import json, sys, urllib.request as u
pw = open('/root/admin-pw').read().strip()
def post(p, b, t=None):
    r = u.Request('http://127.0.0.1:3000/api/' + p, data=json.dumps(b).encode(), method='POST',
                  headers={'content-type': 'application/json', **({'authorization': 'Bearer ' + t} if t else {})})
    return json.load(u.urlopen(r, timeout=1800))
t = post('auth/login', {'username': 'admin', 'password': pw})['token']
print(post(sys.argv[1], json.loads(sys.argv[2]), t).get('ok'))
PY
}

firewall_on() {
  if command -v ufw >/dev/null; then
    ufw allow 22/tcp >/dev/null; ufw allow 3000/tcp >/dev/null; ufw --force enable >/dev/null
    say "ufw : $(ufw status | head -1)"
  elif command -v dnf >/dev/null; then
    dnf install -y -q firewalld >/dev/null 2>&1; systemctl enable --now firewalld >/dev/null 2>&1
    firewall-cmd -q --permanent --add-port=3000/tcp; firewall-cmd -q --reload
    say "firewalld : $(firewall-cmd --state)"
  else
    say "pas d'outil de pare-feu sur cette distribution"
  fi
}

dns_local() {
  echo 'HS_MAIL_DNS_SERVER=127.0.0.1' >> /usr/share/homeserver/.env
  systemctl restart homeserver
  if command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-dkim dnsutils >/dev/null 2>&1
  else dnf install -y -q python3-dkim bind-utils >/dev/null 2>&1; fi
  sleep 4
}

say "$(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2), serveur web $WEB$(command -v getenforce >/dev/null && echo ", SELinux $(getenforce)")"
if [ -f /root/homeserver/scripts/install.sh ]; then
  (cd /root/homeserver && bash scripts/install.sh --uninstall --purge --yes > /root/uninstall.log 2>&1)
  say "désinstallation précédente : code $?"
fi

if $UPGRADE; then
  install_from /tmp/base.tar.gz || { echo "FAIL  installation de la version de référence"; exit 1; }
  $FIREWALL && firewall_on
  say "référence : mail $(api mail/setup '{"hostname":"mail.bench.test"}'), domaine $(api mail/domains.add '{"domain":"bench.test","defaultQuotaMb":500}'), alice $(api mail/boxes.add '{"domain":"bench.test","local":"alice","password":"Boite-De-Test-2026!","displayName":""}')"
  rm -rf /root/homeserver && mkdir /root/homeserver && tar xzf /tmp/src.tar.gz -C /root/homeserver --strip-components=1 2>/dev/null
  (cd /root/homeserver && bash scripts/redeploy.sh --no-pull > /root/redeploy.log 2>&1)
  say "redéploiement des sources testées : code $?"
  sleep 6
  ARGS=(--upgrade "${ARGS[@]}")
else
  install_from /tmp/src.tar.gz || { echo "FAIL  installation"; exit 1; }
  $FIREWALL && firewall_on
fi
$DNS_LOCAL && dns_local

python3 "/tmp/$SUITE" "$(cat /root/admin-pw)" "${ARGS[@]}"
rc=$?
if command -v getenforce >/dev/null && [ "$(getenforce)" = Enforcing ]; then
  denials="$(timeout 40 ausearch --input-logs -m avc -ts today </dev/null 2>/dev/null | grep 'avc:.*denied')"
  say "refus SELinux : $(printf '%s' "$denials" | grep -c denied)"
  printf '%s\n' "$denials" | grep denied | tail -4 | cut -c1-230
fi
exit $rc
