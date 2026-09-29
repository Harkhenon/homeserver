#!/usr/bin/env bash
# Homeserver — bootstrap d'installation
# 1. Crée l'utilisateur système hs-* (nologin, sans mot de passe)
# 2. Installe nvm + Node.js LTS POUR CET UTILISATEUR (via sudo -u)
# 3. Lance l'installateur interactif avec ce Node
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_TARGET=22
NODE_MAJOR_MIN=20
HS_HOME=/var/lib/homeserver

# --- Utilisateur système hs-* -------------------------------------------------
random_name() {
  tr -dc 'a-z' </dev/urandom | head -c 12
}

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
as_hs() {
  sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" bash -c "$*"
}

# --- Node.js (via nvm, pour l'utilisateur hs-*) --------------------------------
as_hs 'command -v node >/dev/null 2>&1' && HS_NODE_OK=1 || HS_NODE_OK=0
if [ "$HS_NODE_OK" -eq 1 ]; then
  HS_NODE_MAJOR="$(as_hs 'node -e "console.log(process.versions.node.split(\".\")[0])"')"
else
  HS_NODE_MAJOR=0
fi

if [ "$HS_NODE_MAJOR" -ge "$NODE_MAJOR_MIN" ]; then
  HS_NODE_BIN="$(as_hs 'command -v node')"
  echo -e "${GREEN}✓${RESET} Node.js $(as_hs 'node --version') déjà présent pour ${HS_USER} — rien à installer."
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
  echo -e "${GREEN}✓${RESET} Node.js $( "$HS_NODE_BIN" --version) installé pour ${HS_USER}."
fi

# --- Installateur interactif -----------------------------------------------------
echo -e "${BOLD}→${RESET} Lancement de l'installateur interactif..."
echo
# install.mjs tourne en root (paquets, systemd) mais avec le Node de l'utilisateur hs-*
exec env HS_USER="$HS_USER" HS_HOME="$HS_HOME" "$HS_NODE_BIN" "$SCRIPT_DIR/install.mjs"
