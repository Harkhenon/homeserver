#!/usr/bin/env bash
# Homeserver — mise à jour du panel (non interactif, appelé par le helper)
# Usage:
#   bash scripts/update.sh --check           # affiche {"current":..., "latest":..., "available":...}
#   bash scripts/update.sh --apply           # git pull + rebuild + restart des services
set -euo pipefail

VERBOSE=false
MODE="apply"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --apply) MODE="apply" ;;
    --verbose|-v) VERBOSE=true ;;
    *) echo "Option inconnue: $arg" >&2; exit 1 ;;
  esac
done

fail() { echo "$1" >&2; exit 1; }

HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${HS_UPDATE_BRANCH:-dev}"

[ -d "$SRC_DIR/.git" ] || fail "$SRC_DIR n'est pas un dépôt git."
[ -d "$INSTALL_DIR" ] || fail "$INSTALL_DIR introuvable — lance d'abord scripts/install.sh."

current_version() { node -e "console.log(require('$SRC_DIR/package.json').version)" 2>/dev/null || echo unknown; }

git_fetch() { git -C "$SRC_DIR" fetch origin "$BRANCH" --tags >/dev/null 2>&1; }

latest_version() {
  git -C "$SRC_DIR" show "origin/$BRANCH:package.json" 2>/dev/null \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('unknown')}})" \
    || echo unknown
}

if [ "$MODE" = "check" ]; then
  git_fetch || fail "git fetch impossible (réseau ?)"
  CUR="$(current_version)"
  LAT="$(latest_version)"
  AVAIL="false"
  [ "$CUR" != "unknown" ] && [ "$LAT" != "unknown" ] && [ "$CUR" != "$LAT" ] && AVAIL="true"
  echo "{\"current\": \"$CUR\", \"latest\": \"$LAT\", \"available\": $AVAIL, \"branch\": \"$BRANCH\"}"
  exit 0
fi

# --- Mode apply ---------------------------------------------------------------------
HS_USER="$(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}')"
[ -n "$HS_USER" ] || fail "Aucun utilisateur hs-* trouvé — lance d'abord scripts/install.sh."

NVM_DIR="$HS_HOME/.nvm"
export NVM_DIR
test -s "$NVM_DIR/nvm.sh" || fail "nvm introuvable dans $NVM_DIR."
HS_NODE_BIN="$(sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -c '. "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm which current' 2>/dev/null || true)"
[ -n "$HS_NODE_BIN" ] || HS_NODE_BIN="$(sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -c '. "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm which default' 2>/dev/null || true)"
[ -n "$HS_NODE_BIN" ] || fail "Node.js introuvable pour $HS_USER."
HS_NPM_BIN="$(dirname "$HS_NODE_BIN")/npm"
HS_NODE_BIN_DIR="$(dirname "$HS_NODE_BIN")"

as_hs() { sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" PATH="$HS_NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "cd '$SRC_DIR' && $*"; }

BEFORE="$(current_version)"

git_fetch || fail "git fetch impossible (réseau ?)"
LOCAL="$(git -C "$SRC_DIR" rev-parse HEAD)"
REMOTE="$(git -C "$SRC_DIR" rev-parse "origin/$BRANCH")"
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "{\"updated\": false, \"current\": \"$BEFORE\", \"latest\": \"$BEFORE\", \"branch\": \"$BRANCH\"}"
  exit 0
fi

git -C "$SRC_DIR" reset --hard "origin/$BRANCH" >/dev/null 2>&1 || fail "git pull impossible (modifications locales ?)"
AFTER="$(current_version)"

run_step() {
  local msg="$1"; shift
  if $VERBOSE; then
    echo "-> $msg" >&2
    "$@"
    echo "OK $msg" >&2
    return
  fi
  "$@" >/dev/null 2>&1 || { fail "Échec: $msg"; }
}

run_step "Sync des sources vers $INSTALL_DIR" bash -c "
  tar -C '$SRC_DIR' \
    --exclude='./node_modules' \
    --exclude='./server/dist' \
    --exclude='./.git' \
    --exclude='./.env' \
    --exclude='./front/dist' \
    --exclude='./front/node_modules' \
    -cf - . | tar -C '$INSTALL_DIR' -xf -
  chown -R '$HS_USER:$HS_USER' '$INSTALL_DIR'"

run_step "Dépendances du back" as_hs "'$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du back" as_hs "'$HS_NPM_BIN' run build"
run_step "Dépendances du front" as_hs "cd '$INSTALL_DIR/front' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du front" as_hs "cd '$INSTALL_DIR/front' && '$HS_NPM_BIN' run build"
run_step "Redémarrage hs-helper" systemctl restart hs-helper
run_step "Redémarrage homeserver" systemctl restart homeserver

echo "{\"updated\": true, \"current\": \"$BEFORE\", \"latest\": \"$AFTER\", \"branch\": \"$BRANCH\"}"
