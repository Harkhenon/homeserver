#!/usr/bin/env bash
# Non-régression des correctifs d'update (VM de banc, root). Affiche PASS/FAIL par scénario.
set -uo pipefail
S=/opt/homeserver/update-status.json
st() { python3 -c "import json;s=json.load(open('$S'));print($1)"; }
stale() { python3 -c "import json;f='$S';s=json.load(open(f));s['lastCheck']='2026-01-01T00:00:00Z';json.dump(s,open(f,'w'))"; }
wait_apply() { sleep 2; while [ "$(systemctl show -p ActiveState --value hs-updater-apply.service)" = activating ]; do sleep 3; done; }
cur() { cat /usr/share/homeserver/current/VERSION; }
health() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/api/health; }
check() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; FAILS=$((FAILS+1)); fi; }
FAILS=0

echo "=== Déploiement du code corrigé par le mécanisme d'update ==="
bench pair 1.1.2 >/dev/null; stale; systemctl start hs-updater-check.service
check "couple auto-mis à jour en 1.1.2" '[ "$(grep -o "1\.1\.2" /usr/local/lib/homeserver/updater/VERSION)" = 1.1.2 ]'
bench panel 0.9.5 >/dev/null; stale; systemctl start hs-updater-check.service; systemctl start hs-updater-apply.service; wait_apply
check "panel corrigé 0.9.5 installé via apply" '[ "$(cur)" = 0.9.5 ] && [ "$(health)" = 200 ]'

echo "=== B'. Vérification forcée ==="
bench panel 0.9.6 >/dev/null
r="$(bench api panel.check)"
check "check normal : toujours en cache (throttling 30 min conservé)" '[[ "$r" == *"\"available\":false"* ]]'
r="$(bench api panel.check '{"force":true}')"
check "check forcé : 0.9.6 détectée immédiatement" '[[ "$r" == *"\"available\":true"* && "$r" == *"0.9.6"* ]]'

echo "=== C'. Réponse immédiate de panel.update ==="
r="$(bench api panel.update)"
check "réponse immédiate = running (plus l'état du run précédent)" '[[ "$r" == *"\"result\":\"running\""* ]]'
wait_apply
check "apply 0.9.6 OK" '[ "$(cur)" = 0.9.6 ] && [ "$(st "s[\"lastRun\"][\"result\"]")" = ok ]'

echo "=== D'. Retour arrière manuel ==="
r="$(bench api panel.rollback)"
check "rollback : réponse reçue (plus de connexion coupée)" '[[ "$r" == *"\"rolledBack\":true"* && "$r" == *"\"current\":\"0.9.5\""* ]]'
sleep 10
check "rollback : 0.9.5 active et panel sain" '[ "$(cur)" = 0.9.5 ] && [ "$(health)" = 200 ]'
r="$(bench api panel.check)"
check "rollback : la 0.9.6 quittée est de nouveau proposée" '[[ "$r" == *"\"available\":true"* && "$r" == *"0.9.6"* ]]'

echo "=== E'. Release cassée → rollback automatique ==="
bench panel 0.9.7 broken >/dev/null
bench api panel.check '{"force":true}' >/dev/null 2>&1 || { sleep 61; bench api panel.check '{"force":true}' >/dev/null; }
r="$(st "(s.get('latest') or {}).get('version')")"
[ "$r" = 0.9.7 ] || { sleep 61; bench api panel.check '{"force":true}' >/dev/null; }
bench api panel.update >/dev/null; wait_apply
check "panel revenu en 0.9.5 ET en service (health 200)" '[ "$(cur)" = 0.9.5 ] && [ "$(health)" = 200 ]'
check "état final = rolledBack (plus bloqué sur running)" '[ "$(st "s[\"lastRun\"][\"result\"]")" = rolledBack ]'
check "release cassée 0.9.7 supprimée du disque" '[ ! -d /opt/homeserver/releases/0.9.7 ]'
st "s['lastRun']['message']"

echo "=== J'. API injoignable pendant un apply ==="
systemctl stop hs-mock
systemctl start hs-updater-apply.service 2>/dev/null; wait_apply
check "apply : échec explicite (plus « déjà à jour »)" '[ "$(st "s[\"lastRun\"][\"result\"]")" = failed ] && [[ "$(st "s[\"lastRun\"][\"message\"]")" == *injoignable* ]]'
systemd-run --unit hs-mock --property=WorkingDirectory=/root/bench/mock python3 -m http.server 8099 --bind 127.0.0.1 >/dev/null 2>&1 || systemctl start hs-mock

echo "=== Bilan : $FAILS échec(s) ==="
exit "$FAILS"
