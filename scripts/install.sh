#!/usr/bin/env bash
# Homeserver — bootstrap d'installation (rôle: root uniquement)
# 1. Crée l'utilisateur système hs-* (nologin, sans mot de passe) + home
# 2. Installe nvm + Node.js LTS en tant que hs-* dans son répertoire
# 3. Crée /usr/share/homeserver, droits hs-* (chmod/chown)
# 4. Vérifie les installations (en tant que hs-*)
# 5. Installe les services systemd (hs-helper en root, homeserver en hs-*)
# 6. Lance install.mjs en tant que hs-*
# Usage: sudo bash scripts/install.sh
set -euo pipefail

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[32m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'

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
  echo -e "${RED}✗ L'installation requiert root (relance avec sudo).${RESET}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_TARGET=22
NODE_MAJOR_MIN=20
HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
HELPER_DIR="$INSTALL_DIR/server/dist/helper"

# --- 1. Utilisateur système hs-* -------------------------------------------------
random_name() { tr -dc 'a-z' </dev/urandom | head -c 12; }

HS_USER="hs-$(random_name)"
if ! id "$HS_USER" >/dev/null 2>&1; then
  echo -e "${BOLD}→${RESET} Création de l'utilisateur système ${HS_USER} (nologin, sans mot de passe)..."
  useradd -r -M -s /usr/sbin/nologin -d "$HS_HOME" "$HS_USER"
else
  echo -e "${GREEN}✓${RESET} Utilisateur ${HS_USER} déjà présent."
fi
mkdir -p "$HS_HOME"
chown "$HS_USER":"$HS_USER" "$HS_HOME"
chmod 750 "$HS_HOME"
echo -e "${GREEN}✓${RESET} Utilisateur: ${HS_USER} (répertoire: $HS_HOME, accès admin: sudo -u $HS_USER <cmd>)"

NVM_DIR="$HS_HOME/.nvm"
export NVM_DIR
as_hs() { sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" bash -c "$*"; }

# --- 2. Node.js (nvm, en tant que hs-*) -------------------------------------------
if as_hs 'command -v node >/dev/null 2>&1'; then
  HS_NODE_MAJOR="$(as_hs 'node -e "console.log(process.versions.node.split(\".\")[0])"')"
else
  HS_NODE_MAJOR=0
fi

if [ "$HS_NODE_MAJOR" -ge "$NODE_MAJOR_MIN" ]; then
  HS_NODE_BIN="$(as_hs 'command -v node')"
  echo -e "${GREEN}✓${RESET} Node.js $(as_hs 'node --version') déjà présent pour ${HS_USER}."
else
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo -e "${BOLD}→${RESET} Installation de nvm pour ${HS_USER}..."
    as_hs 'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash'
    echo -e "${GREEN}✓${RESET} nvm installé dans $NVM_DIR"
  else
    echo -e "${GREEN}✓${RESET} nvm déjà présent pour ${HS_USER}."
  fi
  echo -e "${BOLD}→${RESET} Installation de Node.js $NODE_TARGET (LTS) via nvm pour ${HS_USER}..."
  as_hs '. "$NVM_DIR/nvm.sh" && nvm install '"$NODE_TARGET"' && nvm alias default '"$NODE_TARGET"
  HS_NODE_BIN="$(as_hs '. "$NVM_DIR/nvm.sh" >/dev/null && nvm which '"$NODE_TARGET")"
fi

# --- 3. Copie du panel vers /usr/share/homeserver ---------------------------------
echo -e "${BOLD}→${RESET} Copie du panel vers ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
tar -C "$SCRIPT_DIR" \
  --exclude='./node_modules' \
  --exclude='./server/dist' \
  --exclude='./.git' \
  --exclude='./.env' \
  -cf - . | tar -C "$INSTALL_DIR" -xf -
chown -R "$HS_USER":"$HS_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
echo -e "${GREEN}✓${RESET} Panel copié dans ${INSTALL_DIR} (propriétaire: ${HS_USER})."

# --- 4. Vérifications (en tant que hs-*) ------------------------------------------
echo -e "${BOLD}→${RESET} Vérification des installations (en tant que ${HS_USER})..."
as_hs 'test -s "$NVM_DIR/nvm.sh"' || { echo -e "${RED}✗ nvm introuvable pour ${HS_USER}.${RESET}"; exit 1; }
HS_NODE_VER="$(as_hs "'$HS_NODE_BIN' --version")"
case "$HS_NODE_VER" in
  v2[0-9].*|v[3-9][0-9].*) : ;;
  *) echo -e "${RED}✗ Node $HS_NODE_VER insuffisant (>= $NODE_MAJOR_MIN requis).${RESET}"; exit 1 ;;
esac
echo -e "${GREEN}✓${RESET} nvm: $(as_hs '. "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm --version') | Node: $HS_NODE_VER ($(as_hs 'which node' || echo "$HS_NODE_BIN"))"

# --- 5. Services systemd ----------------------------------------------------------
echo -e "${BOLD}→${RESET} Installation des services systemd..."

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
ExecStart=$HS_NODE_BIN $INSTALL_DIR/server/dist/index.js
Restart=on-failure
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now hs-helper
echo -e "${GREEN}✓${RESET} Services systemd installés (hs-helper démarré)."

# --- 6. Installateur interactif (en tant que hs-*) --------------------------------
echo -e "${BOLD}→${RESET} Lancement de l'installateur interactif en tant que ${HS_USER}..."
echo
cd "$INSTALL_DIR"
exec runuser -u "$HS_USER" -- env \
  HS_USER="$HS_USER" HS_HOME="$HS_HOME" HS_INSTALL_DIR="$INSTALL_DIR" \
  HS_NODE_BIN="$HS_NODE_BIN" HS_HELPER_SOCKET=/run/homeserver/helper.sock \
  "$HS_NODE_BIN" "$INSTALL_DIR/scripts/install.mjs"
