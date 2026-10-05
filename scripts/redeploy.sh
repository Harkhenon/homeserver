#!/usr/bin/env bash
# Homeserver — redéploiement rapide (debug)
# Évite l'installation complète : git pull + rebuild back/front + restart du helper.
# Usage:
#   sudo bash scripts/redeploy.sh            # pull + rebuild + restart helper + panel
#   sudo bash scripts/redeploy.sh --verbose  # sortie bavarde
#   sudo bash scripts/redeploy.sh --no-pull # sans git pull (modifs locales)
set -euo pipefail

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[32m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'

VERBOSE=false
DO_pull=true
for arg in "$@"; do
  case "$arg" in
    --verbose|-v) VERBOSE=true ;;
    --no-pull) do_pull=false ;;
    *) echo -e "${RED}✗ Option inconnue: $arg${RESET}"; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}✗ Cette opération requiert root (relance avec sudo).${RESET}"
  exit 1
fi

fail() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

run_step() {
  local msg="$1"; shift
  if $VERBOSE; then
    echo -e "${BOLD}→${RESET} $msg"
    "$@"
    echo -e "${GREEN}✓${RESET} $msg"
    return
  fi
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0 pid
  printf '%s  ' "$msg"
  "$@" >/dev/null 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    printf '\b%s' "${frames[$((i % 10))]}"
    i=$((i + 1))
    sleep 0.1
  done
  if wait "$pid"; then
    printf '\b\033[32m✓\033[0m\n'
  else
    printf '\b\033[31m✗\033[0m\n'
    return 1
  fi
}

# --- Contexte existant (aucune création) ----------------------------------------------
HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
HELPER_DIR="$INSTALL_DIR/server/dist/helper"

HS_USER="$(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}')"
[ -n "$HS_USER" ] || fail "Aucun utilisateur hs-* trouvé — lance d'abord scripts/install.sh."
[ -d "$INSTALL_DIR" ] || fail "$INSTALL_DIR introuvable — lance d'abord scripts/install.sh."

NVM_DIR="$HS_HOME/.nvm"
export NVM_DIR
HS_NODE_BIN="$(sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -lc 'command -v node' 2>/dev/null || true)"
[ -n "$HS_NODE_BIN" ] || HS_NODE_BIN="$(cd "$INSTALL_DIR" && bash -lc 'command -v node' 2>/dev/null || true)"
[ -n "$HS_NODE_BIN" ] || fail "Node.js introuvable pour $HS_USER."
HS_NPM_BIN="$(dirname "$HS_NODE_BIN")/npm"
HS_NODE_BIN_DIR="$(dirname "$HS_NODE_BIN")"

as_hs() { sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" PATH="$HS_NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "cd '$INSTALL_DIR' && $*"; }

echo -e "${CYAN}Homeserver — redéploiement rapide (${HS_USER})${RESET}"

# --- 1. git pull ---------------------------------------------------------------------
if $do_pull; then
  run_step "git pull dans $INSTALL_DIR" as_hs "git pull --ff-only"
fi

# --- 2. Dépendances + builds ----------------------------------------------------------
run_step "Dépendances du back (npm ci)" as_hs "'$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du back (server/dist, helper inclus)" as_hs "'$HS_NPM_BIN' run build"
test -f "$HELPER_DIR/index.js" || fail "$HELPER_DIR/index.js introuvable après build."
test -f "$INSTALL_DIR/server/dist/server/src/index.js" || fail "server/dist/server/src/index.js introuvable après build."

run_step "Dépendances du front (npm ci)" as_hs "cd '$INSTALL_DIR/front' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du front" as_hs "cd '$INSTALL_DIR/front' && '$HS_NPM_BIN' run build"
test -f "$INSTALL_DIR/front/dist/index.html" || fail "front/dist/index.html introuvable après build."

# --- 3. Redémarrage des services ------------------------------------------------------
run_step "Redémarrage du service hs-helper" systemctl restart hs-helper
run_step "Redémarrage du service homeserver" systemctl restart homeserver

echo -e "${GREEN}✓${RESET} Redéploiement terminé"
echo -e "${DIM}  logs: journalctl -u hs-helper -u homeserver -f${RESET}"
