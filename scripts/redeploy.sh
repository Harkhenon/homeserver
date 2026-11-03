#!/usr/bin/env bash
# Homeserver — redéploiement rapide (debug + mise à jour forcée)
# Deux modes :
#   1. Depuis les sources locales : build une release et bascule current dessus
#      sudo bash scripts/redeploy.sh                  # git pull + release + bascule
#      sudo bash scripts/redeploy.sh --no-pull        # sans git pull (modifs locales)
#   2. Mise à jour forcée depuis GitHub (sans l'updater) :
#      sudo bash scripts/redeploy.sh --force latest    # dernière release publiée
#      sudo bash scripts/redeploy.sh --force 0.7.5     # version précise
# Options : --verbose (sortie bavarde), --no-pull (mode 1 uniquement),
#           --allow-unsigned (mode 2 : accepte une release sans signature — déconseillé)
# Les releases sont construites par scripts/layout.sh (utilisateur homeserver-build) et
# installées en lecture seule (root) dans /opt/homeserver/releases.
set -euo pipefail

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'

VERBOSE=false
DO_PULL=true
FORCE_VERSION=''
ALLOW_UNSIGNED=false

prev=''
for arg in "$@"; do
  if [ "$prev" = "--force" ]; then
    FORCE_VERSION="$arg"   # latest ou X.Y.Z
    prev="$arg"; continue
  fi
  case "$arg" in
    --verbose|-v) VERBOSE=true ;;
    --no-pull) DO_PULL=false ;;
    --allow-unsigned) ALLOW_UNSIGNED=true ;;
    --force) : ;; # la valeur est traitée à l'itération suivante
    *) echo -e "${RED}✗ Option inconnue: $arg${RESET}"; exit 1 ;;
  esac
  prev="$arg"
done
fail() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

[ -z "$FORCE_VERSION" ] || [[ "$FORCE_VERSION" =~ ^(latest|[0-9]+\.[0-9]+(\.[0-9]+)?$) ]] || fail "--force attend 'latest' ou X.Y.Z (reçu: $FORCE_VERSION)"

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}✗ Cette opération requiert root (relance avec sudo).${RESET}"
  exit 1
fi

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
  "$@" >/dev/null 2>"$errfile" &
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
      tail -n 30 "$errfile" | sed 's/^/    /'
    fi
    rm -f "$errfile"
    return 1
  fi
}

# --- Contexte existant ------------------------------------------------------------------
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR=/usr/share/homeserver
OPT_DIR=/opt/homeserver
RELEASES_DIR="$OPT_DIR/releases"
STATE_FILE="$RELEASES_DIR/installed.json"
CURRENT_LINK="$INSTALL_DIR/current"
HS_NODE_BIN="$OPT_DIR/node/bin/node"
PUBKEY_FILE="$SRC_DIR/keys/release-signing.pub.pem"
# Port réel du panel : le .env fait foi (HS_PORT de l'environnement en secours)
PANEL_PORT="$(grep -m1 '^HS_PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -dc '0-9' || true)"
PANEL_PORT="${PANEL_PORT:-${HS_PORT:-3000}}"
HS_USER="$(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}')"

[ -n "$HS_USER" ] || fail "Aucun utilisateur hs-* trouvé — lance d'abord scripts/install.sh."
[ -d "$INSTALL_DIR" ] || fail "$INSTALL_DIR introuvable — lance d'abord scripts/install.sh."

# Bascule + health-check + rollback + mise à jour installed.json (commun aux deux modes)
switch_and_verify() {
  local layout="$1" new_version="$2"
  local prev_version
  prev_version="$(cat "$CURRENT_LINK/VERSION" 2>/dev/null || echo '')"

  bash "$layout" switch "$new_version"
  systemctl reset-failed hs-helper homeserver >/dev/null 2>&1 || true
  run_step "Redémarrage des services" systemctl restart hs-helper homeserver || true
  sleep 5

  local healthy=false
  for _ in $(seq 1 12); do
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
if (prev && prev !== cur) s.previous = prev;
s.current = cur;
s.updatedAt = new Date().toISOString();
s.history = [...(s.history ?? []).slice(-19), { version: cur, at: s.updatedAt, status: 'ok' }];
fs.writeFileSync(file + '.tmp', JSON.stringify(s, null, 2), { mode: 0o644 });
fs.renameSync(file + '.tmp', file);
NODEEOF
    echo -e "${GREEN}✓${RESET} Bascule terminée: $new_version actif"
    echo -e "${DIM}  logs: journalctl -u hs-helper -u homeserver -f${RESET}"
  else
    if [ -n "$prev_version" ] && [ "$prev_version" != "$new_version" ] && [ -d "$RELEASES_DIR/$prev_version" ]; then
      bash "$layout" switch "$prev_version"
      # La release cassée a pu épuiser StartLimitBurst : sans reset-failed, le redémarrage est refusé
      systemctl reset-failed hs-helper homeserver >/dev/null 2>&1 || true
      systemctl restart hs-helper homeserver || true
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
    switch_and_verify "$SRC_DIR/scripts/layout.sh" "$FORCE_VERSION"
    exit 0
  fi

  TARBALL_URL="https://github.com/Harkhenon/homeserver/releases/download/v$FORCE_VERSION/homeserver-v$FORCE_VERSION.tar.gz"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  run_step "Téléchargement v$FORCE_VERSION" curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/panel.tar.gz"
  if curl -fsSL "$TARBALL_URL.sig" -o "$TMP_DIR/panel.tar.gz.sig" 2>/dev/null; then
    openssl pkeyutl -verify -pubin -inkey "$PUBKEY_FILE" -rawin -in "$TMP_DIR/panel.tar.gz" -sigfile "$TMP_DIR/panel.tar.gz.sig" >/dev/null 2>&1 \
      || fail "Signature de la release v$FORCE_VERSION invalide — archive refusée."
    echo -e "${GREEN}✓${RESET} Signature vérifiée"
  elif $ALLOW_UNSIGNED; then
    echo -e "${YELLOW}! Release v$FORCE_VERSION non signée — installée quand même (--allow-unsigned)${RESET}"
  else
    fail "Release v$FORCE_VERSION non signée (pas de .sig) — refusée (--allow-unsigned pour forcer)."
  fi
  mkdir "$TMP_DIR/src"
  run_step "Extraction" tar -xzf "$TMP_DIR/panel.tar.gz" -C "$TMP_DIR/src" --no-same-owner

  # Le préfixe du tarball peut varier (homeserver-X.Y.Z ou homeserver-vX.Y.Z) :
  # on détecte dynamiquement le répertoire racine extrait.
  SRC="$(find "$TMP_DIR/src" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [ -n "$SRC" ] && [ -d "$SRC" ] || fail "Archive extraite inattendue (rien dans $TMP_DIR/src)."
  [ -f "$SRC/package.json" ] || fail "L'archive extraite ne contient pas package.json (structure inattendue : $SRC)."
  # Les anciennes releases n'embarquent pas layout.sh : celui de ce dépôt prend le relais
  LAYOUT="$SRC/scripts/layout.sh"
  [ -f "$LAYOUT" ] || LAYOUT="$SRC_DIR/scripts/layout.sh"

  run_step "Runtime Node, droits et unités (layout root)" bash "$LAYOUT" ensure
  run_step "Build de la release v$FORCE_VERSION (utilisateur homeserver-build)" bash "$LAYOUT" build "$SRC" "$FORCE_VERSION"
  switch_and_verify "$LAYOUT" "$FORCE_VERSION"
  exit 0
fi

# =====================================================================================
# MODE 1 : release depuis les sources locales
# =====================================================================================
echo -e "${CYAN}Homeserver — redéploiement rapide (${HS_USER})${RESET}"

if $DO_PULL; then
  [ -d "$SRC_DIR/.git" ] || fail "$SRC_DIR n'est pas un dépôt git — utilise --no-pull."
  run_step "git pull dans $SRC_DIR" git -C "$SRC_DIR" pull --ff-only
fi

LAYOUT="$SRC_DIR/scripts/layout.sh"
run_step "Runtime Node, droits et unités (layout root)" bash "$LAYOUT" ensure

NEW_VERSION="$("$HS_NODE_BIN" -e "console.log(require('$SRC_DIR/package.json').version)" 2>/dev/null || echo '0.0.0-dev')"
if [ "$NEW_VERSION" = "0.0.0-dev" ]; then NEW_VERSION="0.0.0-dev.$(date +%s)"; fi

run_step "Build de la release $NEW_VERSION (utilisateur homeserver-build)" bash "$LAYOUT" build "$SRC_DIR" "$NEW_VERSION"
switch_and_verify "$LAYOUT" "$NEW_VERSION"
