#!/usr/bin/env bash
# Homeserver — bootstrap d'installation
# Installe nvm + Node.js LTS si nécessaire, puis lance l'installateur interactif.
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
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
NODE_MAJOR_MIN=20
NODE_TARGET=22

node_major() {
  command -v node >/dev/null 2>&1 || echo 0
  node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0
}

NEED_NODE=1
CURRENT="$(node_major)"
if [ "$CURRENT" -ge "$NODE_MAJOR_MIN" ]; then
  echo -e "${GREEN}✓${RESET} Node.js $(node --version) déjà présent — rien à installer."
  NEED_NODE=0
fi

if [ "$NEED_NODE" -eq 1 ]; then
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo -e "${BOLD}→${RESET} Installation de nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    echo -e "${GREEN}✓${RESET} nvm installé dans $NVM_DIR"
  else
    echo -e "${GREEN}✓${RESET} nvm déjà présent."
  fi

  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"

  echo -e "${BOLD}→${RESET} Installation de Node.js $NODE_TARGET (LTS) via nvm..."
  nvm install "$NODE_TARGET"
  nvm use "$NODE_TARGET"
  echo -e "${GREEN}✓${RESET} Node.js $(node --version) installé."
fi

echo -e "${BOLD}→${RESET} Lancement de l'installateur interactif..."
echo
exec node "$SCRIPT_DIR/install.mjs"
