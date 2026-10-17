#!/usr/bin/env bash
# Homeserver — redéploiement rapide (debug + mise à jour forcée)
# Deux modes :
#   1. Depuis les sources locales : build une release et bascule current dessus
#      sudo bash scripts/redeploy.sh                  # git pull + release + bascule
#      sudo bash scripts/redeploy.sh --no-pull        # sans git pull (modifs locales)
#   2. Mise à jour forcée depuis GitHub (sans l'updater) :
#      sudo bash scripts/redeploy.sh --force latest    # dernière release publiée
#      sudo bash scripts/redeploy.sh --force 0.7.5     # version précise
# Options : --verbose (sortie bavarde), --no-pull (mode 1 uniquement)
set -euo pipefail

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[32m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'

VERBOSE=false
DO_PULL=true
FORCE_VERSION=''

prev=''
for arg in "$@"; do
  if [ "$prev" = "--force" ]; then
    FORCE_VERSION="$arg"   # latest ou X.Y.Z
    prev="$arg"; continue
  fi
  case "$arg" in
    --verbose|-v) VERBOSE=true ;;
    --no-pull) DO_PULL=false ;;
    --force) : ;; # la valeur est traitée à l'itération suivante
    *) echo -e "${RED}✗ Option inconnue: $arg${RESET}"; exit 1 ;;
  esac
  prev="$arg"
done
[ -z "$FORCE_VERSION" ] || [[ "$FORCE_VERSION" =~ ^(latest|[0-9]+\.[0-9]+(\.[0-9]+)?$) ]] || fail "--force attend 'latest' ou X.Y.Z (reçu: $FORCE_VERSION)"

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
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0 pid errfile
  errfile="$(mktemp)"
  printf '%s  ' "$msg"
  "$@" 2>"$errfile" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    printf '\b%s' "${frames[$((i % 10))]}"
    i=$((i + 1))
    sleep 0.1
  done
  if wait "$pid"; then
    printf '\b\033[32m✓\033[0m\n'
    rm -f "$errfile"
  else
    printf '\b\033[31m✗\033[0m\n'
    if [ -s "$errfile" ]; then
      echo -e "${DIM}  sortie d'erreur :${RESET}"
      sed 's/^/    /' "$errfile"
    fi
    rm -f "$errfile"
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

# Bascule + health-check + rollback + mise à jour installed.json (commun aux deux modes)
switch_and_verify() {
  local new_version="$1"
  local prev_version
  prev_version="$(cat "$CURRENT_LINK/VERSION" 2>/dev/null || echo '')"

  ln -sfn "$RELEASES_DIR/$new_version" "$CURRENT_LINK"
  run_step "Redémarrage des services" systemctl restart hs-helper homeserver
  sleep 5

  local healthy=false
  for _ in 1 2 3 4 5 6; do
    if systemctl is-active --quiet homeserver && curl -fsS "http://127.0.0.1:$PANEL_PORT/api/health" >/dev/null 2>&1; then
      healthy=true; break
    fi
    sleep 5
  done

  if $healthy; then
    "$HS_NODE_BIN" - "$STATE_FILE" "$prev_version" "$new_version" <<'NODEEOF' 2>/dev/null || true
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
    echo -e "${GREEN}✓${RESET} Bascule terminée: $new_version actif"
    echo -e "${DIM}  logs: journalctl -u hs-helper -u homeserver -f${RESET}"
  else
    if [ -n "$prev_version" ] && [ -d "$RELEASES_DIR/$prev_version" ]; then
      ln -sfn "$RELEASES_DIR/$prev_version" "$CURRENT_LINK"
      systemctl restart hs-helper homeserver
      echo -e "${RED}✗ Health-check échoué — retour à $prev_version${RESET}"
    else
      echo -e "${RED}✗ Health-check échoué (pas de release précédente pour rollback)${RESET}"
    fi
    exit 1
  fi
}

# =====================================================================================
# MODE 2 : mise à jour forcée depuis GitHub (sans l'updater)
# =====================================================================================
if [ -n "$FORCE_VERSION" ]; then
  echo -e "${CYAN}Homeserver — mise à jour forcée depuis GitHub${RESET}"

  if [ "$FORCE_VERSION" = "latest" ]; then
    FORCE_VERSION="$(curl -fsSL https://api.github.com/repos/Harkhenon/homeserver/releases/latest 2>/dev/null \
      | grep -o '"tag_name": *"[^"]*"' | head -1 | grep -o '[0-9][0-9.]*' || true)"
    [ -n "$FORCE_VERSION" ] || fail "Impossible de déterminer la dernière release (API GitHub injoignable)."
  fi

  echo -e "${DIM}  version cible: $FORCE_VERSION${RESET}"

  # Déjà présente sur le disque ? Bascule directe
  if [ -d "$RELEASES_DIR/$FORCE_VERSION" ]; then
    echo -e "${DIM}  release déjà présente sur le disque — bascule directe${RESET}"
    switch_and_verify "$FORCE_VERSION"
    exit 0
  fi

  TARBALL_URL="https://github.com/Harkhenon/homeserver/releases/download/v$FORCE_VERSION/homeserver-v$FORCE_VERSION.tar.gz"
  TMP_DIR="$(mktemp -d)"
  run_step "Téléchargement v$FORCE_VERSION" curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/panel.tar.gz"
  run_step "Extraction" tar -xzf "$TMP_DIR/panel.tar.gz" -C "$TMP_DIR"

  # Le préfixe du tarball peut varier (homeserver-X.Y.Z ou homeserver-vX.Y.Z) :
  # on détecte dynamiquement le répertoire racine extrait.
  SRC="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [ -n "$SRC" ] && [ -d "$SRC" ] || fail "Archive extraite inattendue (rien dans $TMP_DIR)."
  [ -f "$SRC/package.json" ] || fail "L'archive extraite ne contient pas package.json (structure inattendue : $SRC)."

  RELEASE_DIR="$RELEASES_DIR/$FORCE_VERSION"
  run_step "Installation dans $RELEASE_DIR" bash -c "rm -rf '$RELEASE_DIR' && mkdir -p '$RELEASE_DIR' && cp -a '$SRC/.' '$RELEASE_DIR/'"
  cp "$INSTALL_DIR/.env" "$RELEASE_DIR/.env" 2>/dev/null || true
  echo "$FORCE_VERSION" > "$RELEASE_DIR/VERSION"
  chown -R "$HS_USER:$HS_USER" "$RELEASE_DIR"

  run_step "Dépendances du back (npm ci)" as_hs "cd '$RELEASE_DIR' && '$HS_NPM_BIN' ci --no-audit --no-fund"
  run_step "Build du back" as_hs "cd '$RELEASE_DIR' && '$HS_NPM_BIN' run build"
  run_step "Dépendances du front (npm ci)" as_hs "cd '$RELEASE_DIR/front' && '$HS_NPM_BIN' ci --no-audit --no-fund"
  run_step "Build du front" as_hs "cd '$RELEASE_DIR/front' && '$HS_NPM_BIN' run build"

  rm -rf "$TMP_DIR"
  switch_and_verify "$FORCE_VERSION"
  exit 0
fi

# =====================================================================================
# MODE 1 : release depuis les sources locales
# =====================================================================================
echo -e "${CYAN}Homeserver — redéploiement rapide (${HS_USER})${RESET}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if $DO_PULL; then
  [ -d "$SRC_DIR/.git" ] || fail "$SRC_DIR n'est pas un dépôt git — utilise --no-pull."
  run_step "git pull dans $SRC_DIR" git -C "$SRC_DIR" pull --ff-only
fi

NEW_VERSION="$("$HS_NODE_BIN" -e "console.log(require('$SRC_DIR/package.json').version)" 2>/dev/null || echo '0.0.0-dev')"
if [ "$NEW_VERSION" = "0.0.0-dev" ]; then NEW_VERSION="dev-$(date +%s)"; fi
RELEASE_DIR="$RELEASES_DIR/$NEW_VERSION"

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
    --exclude='./dist' \
    -cf - . | tar -C '$RELEASE_DIR' -xf -
  [ -f '$INSTALL_DIR/.env' ] && cp '$INSTALL_DIR/.env' '$RELEASE_DIR/.env'
  chown -R '$HS_USER:$HS_USER' '$RELEASE_DIR'
"

run_step "Dépendances du back (npm ci)" as_hs "cd '$RELEASE_DIR' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du back (server/dist, helper inclus)" as_hs "cd '$RELEASE_DIR' && '$HS_NPM_BIN' run build"
test -f "$RELEASE_DIR/server/dist/helper/index.js" || fail "$RELEASE_DIR/server/dist/helper/index.js introuvable après build."
test -f "$RELEASE_DIR/server/dist/server/src/index.js" || fail "server/dist/server/src/index.js introuvable après build."

run_step "Dépendances du front (npm ci)" as_hs "cd '$RELEASE_DIR/front' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du front" as_hs "cd '$RELEASE_DIR/front' && '$HS_NPM_BIN' run build"
test -f "$RELEASE_DIR/front/dist/index.html" || fail "front/dist/index.html introuvable après build."

echo "$NEW_VERSION" > "$RELEASE_DIR/VERSION"
chown "$HS_USER:$HS_USER" "$RELEASE_DIR/VERSION"

switch_and_verify "$NEW_VERSION"
