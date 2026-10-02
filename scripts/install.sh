#!/usr/bin/env bash
# Homeserver — bootstrap d'installation (rôle: root uniquement)
# Usage:
#   sudo bash scripts/install.sh                # installation
#   sudo bash scripts/install.sh --verbose      # installation bavarde
#   sudo bash scripts/install.sh -u|--uninstall # désinstallation complète
set -euo pipefail

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[32m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'

VERBOSE=false
UNINSTALL=false
for arg in "$@"; do
  case "$arg" in
    -u|--uninstall) UNINSTALL=true ;;
    --verbose|-v) VERBOSE=true ;;
    *) echo -e "${RED}✗ Option inconnue: $arg${RESET}"; exit 1 ;;
  esac
done

echo -e "${CYAN}"
cat <<'BANNER'
 ▄▄    ▄▄                                  ▄▄▄▄
 ██    ██                                ▄█▀▀▀▀█
 ██    ██   ▄████▄   ████▄██▄   ▄████▄   ██▄        ▄████▄    ██▄████  ██▄  ▄██   ▄████▄    ██▄████
 ████████  ██▀  ▀██  ██ ██ ██  ██▄▄▄▄██   ▀████▄   ██▄▄▄▄██   ██▀       ██  ██   ██▄▄▄▄██   ██▀
 ██    ██  ██    ██  ██ ██ ██  ██▀▀▀▀▀▀       ▀██  ██▀▀▀▀▀▀   ██        ▀█▄▄█▀   ██▀▀▀▀▀▀   ██
 ██    ██  ▀██▄▄██▀  ██ ██ ██  ▀██▄▄▄▄█  █▄▄▄▄▄█▀  ▀██▄▄▄▄█   ██         ████    ▀██▄▄▄▄█   ██
 ▀▀    ▀▀    ▀▀▀▀    ▀▀ ▀▀ ▀▀    ▀▀▀▀▀    ▀▀▀▀▀      ▀▀▀▀▀    ▀▀          ▀▀       ▀▀▀▀▀    ▀▀
BANNER
echo -e "${RESET}${DIM}        Panel de gestion de serveur web/hébergement${RESET}"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}✗ Cette opération requiert root (relance avec sudo).${RESET}"
  exit 1
fi

fail() { echo -e "${RED}✗ $1${RESET}"; exit 1; }

# --- Exécution d'une étape : verbose = sortie brute, sinon spinner ----------------
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_TARGET=22
NODE_MAJOR_MIN=20
HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
HELPER_DIR="$INSTALL_DIR/server/dist/helper"

# --- Désinstallation ----------------------------------------------------------------
if $UNINSTALL; then
  echo -e "${BOLD}→${RESET} Désinstallation de Homeserver"
  echo -e "${DIM}  Supprimera: services systemd, ${INSTALL_DIR}, ${HS_HOME}, utilisateur hs-*${RESET}"
  read -r -p "  Continuer ? [y/N] " confirm
  case "$confirm" in
    y|Y|yes|oui|o) : ;;
    *) echo "Annulé."; exit 0 ;;
  esac

  systemctl stop homeserver hs-helper 2>/dev/null || true
  systemctl disable homeserver hs-helper 2>/dev/null || true
  rm -f /etc/systemd/system/homeserver.service /etc/systemd/system/hs-helper.service
  systemctl daemon-reload

  for u in $(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1}'); do
    run_step "Suppression de l'utilisateur $u" userdel -r -f "$u" || true
  done
  rm -rf "$INSTALL_DIR" "$HS_HOME" /run/homeserver
  echo -e "${GREEN}✓ Homeserver désinstallé.${RESET}"
  exit 0
fi

# --- 1. Utilisateur système hs-* ----------------------------------------------------
HS_USER="$(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}')"
if [ -n "$HS_USER" ]; then
  echo -e "${GREEN}✓${RESET} Utilisateur existant réutilisé: ${HS_USER} (aucun doublon créé)"
else
  random_name() { head -c 256 /dev/urandom | tr -dc 'a-z' | head -c 12 || true; }
  HS_USER="hs-$(random_name)"
  run_step "Création de l'utilisateur système $HS_USER (nologin)" useradd -r -M -s /usr/sbin/nologin -d "$HS_HOME" "$HS_USER"
fi
mkdir -p "$HS_HOME"
chown "$HS_USER":"$HS_USER" "$HS_HOME"
chmod 750 "$HS_HOME"
echo -e "${DIM}  répertoire: $HS_HOME — accès admin: sudo -u $HS_USER <cmd>${RESET}"

NVM_DIR="$HS_HOME/.nvm"
export NVM_DIR
HS_NODE_BIN_DIR=""
as_hs() { sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" PATH="$HS_NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "cd '$HS_HOME' && $*"; }

# --- 2. Node.js (nvm, en tant que hs-*) ---------------------------------------------
if as_hs 'command -v node >/dev/null 2>&1'; then
  HS_NODE_MAJOR="$(as_hs 'node -e "console.log(process.versions.node.split(\".\")[0])"')"
else
  HS_NODE_MAJOR=0
fi

if [ "$HS_NODE_MAJOR" -ge "$NODE_MAJOR_MIN" ]; then
  HS_NODE_BIN="$(as_hs 'command -v node')"
  HS_NODE_BIN_DIR="$(dirname "$HS_NODE_BIN")"
  echo -e "${GREEN}✓${RESET} Node.js $(as_hs 'node --version') déjà présent pour ${HS_USER}."
else
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    run_step "Installation de nvm pour ${HS_USER}" as_hs 'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash'
  fi
  run_step "Installation de Node.js ${NODE_TARGET} (LTS) via nvm" as_hs '. "$NVM_DIR/nvm.sh" && nvm install '"$NODE_TARGET"' && nvm alias default '"$NODE_TARGET"
  HS_NODE_BIN="$(as_hs '. "$NVM_DIR/nvm.sh" >/dev/null && nvm which '"$NODE_TARGET")"
  HS_NODE_BIN_DIR="$(dirname "$HS_NODE_BIN")"
fi

# --- 3. Copie du panel vers /usr/share/homeserver -----------------------------------
run_step "Copie du panel vers ${INSTALL_DIR}" bash -c "
  mkdir -p '$INSTALL_DIR'
  tar -C '$SCRIPT_DIR' \
    --exclude='./node_modules' \
    --exclude='./server/dist' \
    --exclude='./.git' \
    --exclude='./.env' \
    --exclude='./front/dist' \
    -cf - . | tar -C '$INSTALL_DIR' -xf -
  chown -R '$HS_USER:$HS_USER' '$INSTALL_DIR'
  chmod 750 '$INSTALL_DIR'
"

# --- 4. Vérifications (en tant que hs-*) ----------------------------------------------
as_hs 'test -s "$NVM_DIR/nvm.sh"' || fail "nvm introuvable pour ${HS_USER}."
HS_NODE_VER="$(as_hs "'$HS_NODE_BIN' --version")"
case "$HS_NODE_VER" in
  v2[0-9].*|v[3-9][0-9].*) : ;;
  *) fail "Node $HS_NODE_VER insuffisant (>= $NODE_MAJOR_MIN requis)." ;;
esac

HS_NPM_BIN="$(dirname "$HS_NODE_BIN")/npm"

# --- 5. Build du panel (back + front, en tant que hs-*) -------------------------------
echo -e "${BOLD}→${RESET} Préparation de l'environnement (dépendances + builds)"
run_step "Installation des dépendances du back" as_hs "cd '$INSTALL_DIR' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du back (server/dist, helper inclus)" as_hs "cd '$INSTALL_DIR' && '$HS_NPM_BIN' run build"
test -f "$HELPER_DIR/index.js" || fail "$HELPER_DIR/index.js introuvable après build."
test -f "$INSTALL_DIR/server/dist/server/src/index.js" || fail "server/dist/server/src/index.js introuvable après build."
run_step "Installation des dépendances du front" as_hs "cd '$INSTALL_DIR/front' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "Build du front" as_hs "cd '$INSTALL_DIR/front' && '$HS_NPM_BIN' run build"
test -f "$INSTALL_DIR/front/dist/index.html" || fail "front/dist/index.html introuvable après build."

# --- 6. Services systemd ---------------------------------------------------------------
cat > /etc/systemd/system/hs-helper.service <<UNIT
[Unit]
Description=Homeserver helper privilégié
After=network.target

[Service]
Type=simple
User=root
ExecStart=$HS_NODE_BIN $HELPER_DIR/index.js
Restart=on-failure
RuntimeDirectory=homeserver
RuntimeDirectoryMode=0750

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/homeserver.service <<UNIT
[Unit]
Description=Homeserver panel
After=network.target hs-helper.service
Requires=hs-helper.service

[Service]
Type=simple
User=$HS_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$HS_NODE_BIN $INSTALL_DIR/server/dist/server/src/index.js
Restart=on-failure
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
run_step "Activation du service hs-helper" systemctl enable --now hs-helper
echo -e "${GREEN}✓${RESET} Services systemd installés"

# --- 7. Installateur interactif (en tant que hs-*) --------------------------------------
echo -e "${BOLD}→${RESET} Configuration interactive (${HS_USER})"
echo
cd "$INSTALL_DIR"
exec runuser -u "$HS_USER" -- env \
  HS_USER="$HS_USER" HS_HOME="$HS_HOME" HS_INSTALL_DIR="$INSTALL_DIR" \
  HS_NODE_BIN="$HS_NODE_BIN" HS_HELPER_SOCKET=/run/homeserver/helper.sock \
  "$HS_NODE_BIN" "$INSTALL_DIR/scripts/install.mjs"
