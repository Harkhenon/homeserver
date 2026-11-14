#!/usr/bin/env bash
# Tests de bout en bout sur VMs Multipass jetables, depuis la machine de développement
# (Git Bash sous Windows, ou Linux). Les VMs sont toujours supprimées à la fin, sauf --keep.
#
#   bash tests/vm/run.sh <suite> [options]
#
# Suites : mail1 (socle) · mail2 (DNS, délivrabilité) · mail3 (boîtes) · mail4 (protection) · mail5 (webmail)
#
# Options :
#   --images "26.04 24.04 debian fedora"   images Multipass testées (défaut : ces quatre), en parallèle
#   --web apache|nginx|mix   serveur web ; mix alterne apache et nginx d'une image à l'autre (défaut : apache)
#   --upgrade [réf]          installe d'abord la référence git (défaut : origin/main), puis les sources testées
#   --peer                   VM voisine : vrais bannissements fail2ban (mail4, mail5)
#   --firewall               active ufw ou firewalld dans les VMs (défaut pour mail4 et mail5)
#   --memory 2G              mémoire par VM (4G conseillé pour mail4 --clamav)
#   --keep                   garde les VMs à la fin (pour enquêter)
#   -- <arguments>           transmis à la suite (ex. -- --clamav)
#
# Ce qui est testé : l'arbre de travail tel quel, modifications non commitées comprises (sans .claude/).
# Journaux complets : tests/vm/out/<date>/<vm>.log (ignoré par git).
set -uo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
SUITE="${1:-}"; [ -n "$SUITE" ] || { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
shift
IMAGES="26.04 24.04 debian fedora"; WEB=apache; UPGRADE=''; PEER=false; FIREWALL=''; MEMORY=2G; KEEP=false; ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --images) IMAGES="$2"; shift ;;
    --web) WEB="$2"; shift ;;
    --upgrade) UPGRADE='origin/main'; if [ $# -gt 1 ] && [[ "$2" != --* ]]; then UPGRADE="$2"; shift; fi ;;
    --peer) PEER=true ;;
    --firewall) FIREWALL=true ;;
    --memory) MEMORY="$2"; shift ;;
    --keep) KEEP=true ;;
    --) shift; ARGS=("$@"); break ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done

case "$SUITE" in
  mail1) FILE=mail1-socle.py; EXTRA=() ;;
  mail2) FILE=mail2-dns.py; EXTRA=(--dns-local) ;;
  mail3) FILE=mail3-boites.py; EXTRA=() ;;
  mail4) FILE=mail4-protection.py; EXTRA=(); [ -n "$FIREWALL" ] || FIREWALL=true ;;
  mail5) FILE=mail5-webmail.py; EXTRA=(); [ -n "$FIREWALL" ] || FIREWALL=true ;;
  *) echo "suite inconnue : $SUITE (mail1 à mail5)" >&2; exit 2 ;;
esac
[ "$FIREWALL" = true ] && EXTRA+=(--firewall)

for c in multipass git tar; do command -v "$c" >/dev/null || { echo "commande requise : $c" >&2; exit 2; }; done
OUT="tests/vm/out/$(date +%Y%m%d-%H%M%S)-$SUITE"
mkdir -p "$OUT"
ID="$(date +%H%M%S)"
VMS=()

cleanup() {
  if $KEEP; then echo "VMs conservées : ${VMS[*]} (multipass delete --purge ${VMS[*]})"; return; fi
  [ ${#VMS[@]} -gt 0 ] && multipass delete --purge "${VMS[@]}" </dev/null >/dev/null 2>&1
}
trap cleanup EXIT
# Interruption (Ctrl+C, arrêt de la tâche) : sortir proprement pour que le nettoyage ait lieu
trap 'exit 130' INT TERM HUP

# Archive de l'arbre de travail, fins de ligne LF, sans toucher à l'index réel
archive() { # réf|WORKTREE fichier
  if [ "$1" = WORKTREE ]; then
    # Index temporaire dans le dossier de sortie : Git pour Windows ne comprend pas /tmp de Git Bash
    local idx="$OUT/.index"; rm -f "$idx"
    GIT_INDEX_FILE="$idx" git read-tree HEAD || return 1
    GIT_INDEX_FILE="$idx" git -c core.safecrlf=false add -A -- . ':!.claude' 2>/dev/null
    local tree; tree="$(GIT_INDEX_FILE="$idx" git write-tree)"; rm -f "$idx"
    git -c core.autocrlf=false archive --format=tar.gz --prefix=homeserver/ -o "$2" "$tree"
  else
    git fetch -q origin 2>/dev/null
    git -c core.autocrlf=false archive --format=tar.gz --prefix=homeserver/ -o "$2" "$1"
  fi
}
archive WORKTREE "$OUT/src.tar.gz" || { echo "archive des sources impossible" >&2; exit 1; }
[ -z "$UPGRADE" ] || archive "$UPGRADE" "$OUT/base.tar.gz" || { echo "référence $UPGRADE introuvable" >&2; exit 1; }
cp tests/vm/vm-run.sh tests/vm/suites/"$FILE" "$OUT/"
sed -i 's/\r$//' "$OUT/vm-run.sh" "$OUT/$FILE"

# Lancements un par un : en parallèle, Multipass coupe parfois le réseau des VMs déjà lancées
i=0
for img in $IMAGES; do
  i=$((i + 1)); vm="hst-$SUITE-$i-$ID"
  if multipass launch "$img" -n "$vm" -c 2 -m "$MEMORY" -d 15G --timeout 900 </dev/null >/dev/null 2>&1; then
    VMS+=("$vm"); echo "VM $vm ($img) lancée"
  else
    echo "FAIL  lancement de $img"
  fi
done
if $PEER; then
  if multipass launch 26.04 -n "hst-pair-$ID" -c 1 -m 1G -d 10G --timeout 900 </dev/null >/dev/null 2>&1; then
    VMS+=("hst-pair-$ID"); echo "VM voisine hst-pair-$ID lancée"
  else
    echo "FAIL  lancement de la VM voisine"; PEER=false
  fi
fi

# multipass transfer veut des chemins relatifs au dossier courant sous Windows
send() { # vm fichiers...
  local vm="$1"; shift
  (cd "$OUT" && for f in "$@"; do multipass transfer "$f" "$vm:/tmp/$f" </dev/null || exit 1; done)
}

run_one() { # index vm
  local n="$1" vm="$2" web="$WEB" img
  img="$(echo "$IMAGES" | tr -s ' ' '\n' | sed -n "${n}p")"
  [ "$WEB" = mix ] && { [ $((n % 2)) -eq 1 ] && web=apache || web=nginx; }
  local files=(src.tar.gz vm-run.sh "$FILE"); [ -n "$UPGRADE" ] && files+=(base.tar.gz)
  send "$vm" "${files[@]}" || { echo "FAIL  transfert vers $vm" > "$OUT/$vm.log"; return; }
  local suite_args=("${ARGS[@]}")
  [ "$SUITE" = mail4 ] && [[ "$img" == fedora* ]] && suite_args+=(--no-rspamd)
  local opts=(--web "$web" "${EXTRA[@]}"); [ -n "$UPGRADE" ] && opts+=(--upgrade)
  timeout 2400 multipass exec "$vm" -- sudo bash /tmp/vm-run.sh "$FILE" "${opts[@]}" -- "${suite_args[@]}" </dev/null > "$OUT/$vm.log" 2>&1
  echo "code $?" >> "$OUT/$vm.log"
}

n=0
for vm in "${VMS[@]}"; do
  [[ "$vm" == hst-pair-* ]] && continue
  n=$((n + 1)); run_one "$n" "$vm" &
done
wait

vm_ip() { multipass info "$1" --format csv </dev/null 2>/dev/null | awk -F, 'NR==1 {for (i = 1; i <= NF; i++) if (tolower($i) == "ipv4") c = i} NR==2 {print $c}'; }

# Vrais bannissements depuis la VM voisine : l'IP doit être inscrite ET le port réellement coupé
ban_checks() { # vm ip
  local vm="$1" ip="$2" peer="hst-pair-$ID" peer_ip pairs mode jail banned probe
  peer_ip="$(vm_ip "$peer")"
  if [ "$SUITE" = mail5 ]; then pairs="login:roundcube-auth:443"; else pairs="smtp:postfix-sasl:587 smtp465:postfix-sasl:587 imap:dovecot:587 rcpt:postfix:587"; fi
  for p in $pairs; do
    mode="${p%%:*}"; jail="$(echo "$p" | cut -d: -f2)"
    local script=ban-mail.py; [ "$SUITE" = mail5 ] && script=ban-webmail.py
    timeout 300 multipass exec "$peer" -- sudo python3 "/tmp/$script" "$ip" "$mode" </dev/null >/dev/null 2>&1
    sleep 8
    banned="$(timeout 60 multipass exec "$vm" -- sudo fail2ban-client status "$jail" </dev/null 2>/dev/null | grep -c "$peer_ip")"
    probe="$(timeout 60 multipass exec "$peer" -- sudo python3 "/tmp/$script" "$ip" probe </dev/null 2>/dev/null | head -1)"
    if [ "$banned" -ge 1 ] && [[ "$probe" == *False ]]; then echo "PASS  ban $mode → $jail (coupé)"; else echo "FAIL  ban $mode → $jail : inscrit=$banned, $probe"; fi
    timeout 60 multipass exec "$vm" -- sudo fail2ban-client unban "$peer_ip" </dev/null >/dev/null 2>&1
    sleep 2
  done
}
if $PEER && { [ "$SUITE" = mail4 ] || [ "$SUITE" = mail5 ]; }; then
  cp tests/vm/peer/ban-mail.py tests/vm/peer/ban-webmail.py "$OUT/"
  send "hst-pair-$ID" ban-mail.py ban-webmail.py
  for vm in "${VMS[@]}"; do
    [[ "$vm" == hst-pair-* ]] && continue
    ip="$(vm_ip "$vm")"
    ban_checks "$vm" "$ip" >> "$OUT/$vm.log" 2>&1
  done
fi

# Résumé : seuls les échecs et les lignes d'information sont affichés
total_fail=0
n=0
for vm in "${VMS[@]}"; do
  [[ "$vm" == hst-pair-* ]] && continue
  n=$((n + 1))
  img="$(echo "$IMAGES" | tr -s ' ' '\n' | sed -n "${n}p")"
  fails="$(grep -c '^FAIL' "$OUT/$vm.log")"; passes="$(grep -c '^PASS' "$OUT/$vm.log")"
  total_fail=$((total_fail + fails))
  echo "=== $img ($vm) : $passes réussis, $fails échecs"
  grep -E '^(FAIL|-- |INFO|Traceback)' "$OUT/$vm.log" | cut -c1-300
done
echo "Journaux : $OUT"
[ "$total_fail" -eq 0 ]
