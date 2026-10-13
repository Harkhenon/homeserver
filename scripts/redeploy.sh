#!/usr/bin/env bash
# Homeserver — redéploiement rapide (debug)
# Build une release depuis les sources locales (optionnel: git pull avant)
# et bascule le symlink current dessus, comme l'updater, mais sans passer par GitHub.
# Usage:
#   sudo bash scripts/redeploy.sh            # pull + release + bascule
#   sudo bash scripts/redeploy.sh --verbose  # sortie bavarde
#   sudo bash scripts/redeploy.sh --no-pull  # sans git pull (modifs locales)
set -euo pipefail

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[32m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'

VERBOSE=false
DO_PULL=true
for arg in "$@"; do
  case "$arg" in
    --verbose|-v) VERBOSE=true ;;
    --no-pull) DO_PULL=false ;;
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
RELEASES_DIR="$HS_HOME/releases"
STATE_FILE="$RELEASES_DIR/installed.json"
CURRENT_LINK="$INSTALL_DIR/current"
PANEL_PORT="${HS_PORT:-3000}"

HS_USER="$(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}')"
[ -n "$HS_USER" ] || fail "Aucun utilisateur hs-* trouvé — lance d'abord scripts/install.sh."
[ -d "$INSTALL_DIR" ] || fail "$INSTALL_DIR introuvable — lance d'abord scripts/install.sh."

NVM_DIR="$HS_HOME/.nvm"
export NVM_DIR
test -s "$NVM_DIR/nvm.sh" || fail "nvm introuvable dans $NVM_DIR — installation incomplète ?"
HS_NODE_BIN="$(sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -c '. "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm which current' 2>/dev/null || true)"
[ -n "$HS_NODE_BIN" ] || HS_NODE_BIN="$(sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -c '. "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm which default' 2>/dev/null || true)"
[ -n "$HS_NODE_BIN" ] || fail "Node.js introuvable pour $HS_USER (nvm install ?)."
HS_NPM_BIN="$(dirname "$HS_NODE_BIN")/npm"
HS_NODE_BIN_DIR="$(dirname "$HS_NODE_BIN")"

as_hs() { sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" PATH="$HS_NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"; }

echo -e "${CYAN}Homeserver — redéploiement rapide (${HS_USER})${RESET}"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- 1. git pull optionnel -------------------------------------------------------------
if $DO_PULL; then
  [ -d "$SRC_DIR/.git" ] || fail "$SRC_DIR n'est pas un dépôt git — utilise --no-pull."
  run_step "git pull dans $SRC_DIR" git -C "$SRC_DIR" pull --ff-only
fi

# --- 2. Release depuis les sources locales ----------------------------------------------
NEW_VERSION="$("$HS_NODE_BIN" -e "console.log(require('$SRC_DIR/package.json').version)" 2>/dev/null || echo '0.0.0-dev')"
if [ "$NEW_VERSION" = "0.0.0-dev" ]; then NEW_VERSION="dev-$(date +%s)"; fi
RELEASE_DIR="$RELEASES_DIR/$NEW_VERSION"
PREV_VERSION="$(cat "$CURRENT_LINK/VERSION" 2>/dev/null || echo '')"

run_step "Release $NEW_VERSION (copie des sources)" bash -c "
  rm -rf '$RELEASE_DIR'
  mkdir -p '$RELEASE_DIR'
  tar -C '$SRC_DIR' \
    --exclude='./node_modules' \
    --exclude='./server/dist' \
    --exclude='./.git' \
    --exclude='./.env' \
    --exclude='./front/dist' \
    --exclude='./front/node_modules' \
    -cf - . | tar -C '$RELEASE_DIR' -xf -
  [ -f '$INSTALL_DIR/.env' ] && cp '$INSTALL_DIR/.env' '$RELEASE_DIR/.env'
  chown -R '$HS_USER:$HS_USER' '$RELEASE_DIR'"

run_step "Dépendances du back (npm ci)" as_hs "cd '$RELEASE_DIR' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du back (server/dist, helper inclus)" as_hs "cd '$RELEASE_DIR' && '$HS_NPM_BIN' run build"
test -f "$RELEASE_DIR/server/dist/helper/index.js" || fail "$RELEASE_DIR/server/dist/helper/index.js introuvable après build."
test -f "$RELEASE_DIR/server/dist/server/src/index.js" || fail "server/dist/server/src/index.js introuvable après build."
run_step "Dépendances du front (npm ci)" as_hs "cd '$RELEASE_DIR/front' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du front" as_hs "cd '$RELEASE_DIR/front' && '$HS_NPM_BIN' run build"
test -f "$RELEASE_DIR/front/dist/index.html" || fail "front/dist/index.html introuvable après build."
echo "$NEW_VERSION" > "$RELEASE_DIR/VERSION"
chown "$HS_USER:$HS_USER" "$RELEASE_DIR/VERSION"

# --- 3. Bascule + health-check + rollback ------------------------------------------------
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
run_step "Redémarrage des services" systemctl restart hs-helper homeserver

sleep 5
HEALTHY=false
for _ in 1 2 3 4 5 6; do
  if systemctl is-active --quiet homeserver && curl -fsS "http://127.0.0.1:$PANEL_PORT/api/health" >/dev/null 2>&1; then
    HEALTHY=true; break
  fi
  sleep 5
done

if $HEALTHY; then
  # Mettre à jour installed.json (previous = ancienne release, current = nouvelle)
  "$HS_NODE_BIN" - "$STATE_FILE" "$PREV_VERSION" "$NEW_VERSION" <<'NODEEOF' 2>/dev/null || true
const fs = require('fs');
const [file, prev, cur] = process.argv.slice(2);
let s = {};
try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
s.previous = prev || null;
s.current = cur;
s.updatedAt = new Date().toISOString();
s.history = [...(s.history ?? []).slice(-19), { version: cur, at: s.updatedAt, status: 'ok' }];
fs.writeFileSync(file, JSON.stringify(s, null, 2));
NODEEOF
  echo -e "${GREEN}✓${RESET} Redéploiement terminé: $NEW_VERSION actif"
  echo -e "${DIM}  logs: journalctl -u hs-helper -u homeserver -f${RESET}"
else
  if [ -n "$PREV_VERSION" ] && [ -d "$RELEASES_DIR/$PREV_VERSION" ]; then
    ln -sfn "$RELEASES_DIR/$PREV_VERSION" "$CURRENT_LINK"
    systemctl restart hs-helper homeserver
    echo -e "${RED}✗ Health-check échoué — retour à $PREV_VERSION${RESET}"
  else
    echo -e "${RED}✗ Health-check échoué (pas de release précédente pour rollback)${RESET}"
  fi
  exit 1
fi
