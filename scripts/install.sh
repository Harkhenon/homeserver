#!/usr/bin/env bash
# Homeserver — bootstrap d'installation (rôle: root uniquement)
# Usage:
#   sudo bash scripts/install.sh                     # installation interactive
#   sudo bash scripts/install.sh --yes               # sans question (valeurs par défaut / variables HS_*)
#   sudo bash scripts/install.sh --verbose           # sortie brute des commandes
#   sudo bash scripts/install.sh --uninstall [--yes] [--purge]
#   sudo bash scripts/install.sh --help
#
# Variables reconnues en mode non interactif (toutes optionnelles) :
#   HS_ADMIN_USER          utilisateur admin du panel            [admin]
#   HS_PORT                port de l'API (1024-65535)            [3000]
#   HS_HOST                0.0.0.0 | 127.0.0.1                   [0.0.0.0]
#   HS_WEB_SERVER          apache | nginx                        [apache]
#   HS_PHP_VERSION         x.y | latest | none                   [latest]
#   HS_INSTALL_EXTRAS      yes | no (MariaDB, Bind9, Certbot, Cron) [yes]
#   HS_PANEL_DOMAIN        domaine du panel pour HTTPS Let's Encrypt [vide]
#   HS_LETSENCRYPT_EMAIL   email Let's Encrypt (requis si HS_PANEL_DOMAIN)
#   HS_UPDATER_TARBALL_URL source du couple updater (URL ou chemin local)
#   HS_SKIP_FIREWALL=1     ne pas ouvrir le port du panel dans ufw/firewalld
set -Eeuo pipefail
umask 022

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'
if [ ! -t 1 ]; then BOLD=''; CYAN=''; GREEN=''; YELLOW=''; RED=''; DIM=''; RESET=''; fi

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

VERBOSE=false
UNINSTALL=false
ASSUME_YES=false
PURGE=false
for arg in "$@"; do
  case "$arg" in
    -u|--uninstall) UNINSTALL=true ;;
    -v|--verbose) VERBOSE=true ;;
    -y|--yes|--non-interactive) ASSUME_YES=true ;;
    --purge) PURGE=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo -e "${RED}✗ Option inconnue: $arg${RESET}" >&2; usage >&2; exit 1 ;;
  esac
done

echo -e "${CYAN}"
cat <<'BANNER'
██╗  ██╗ ██████╗ ███╗   ███╗███████╗███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗
██║  ██║██╔═══██╗████╗ ████║██╔════╝██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗
███████║██║   ██║██╔████╔██║█████╗  ███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝
██╔══██║██║   ██║██║╚██╔╝██║██╔══╝  ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗
██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║
╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝
BANNER
echo -e "${RESET}${DIM}        Panel de gestion de serveur web/hébergement${RESET}"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}✗ Cette opération requiert root (relance avec sudo).${RESET}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_TARGET=22
NODE_MAJOR_MIN=20
NVM_VERSION=v0.40.3
HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
RELEASES_DIR="$HS_HOME/releases"
PAIR_DIR=/usr/local/lib/homeserver/updater
LOG_DIR=/var/log/homeserver
LOG_FILE="$LOG_DIR/install.log"
MIN_FREE_MB=3072
CURL=(curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 15)

mkdir -p "$LOG_DIR"
chmod 750 "$LOG_DIR"
{ echo; echo "=== $(date -u +%FT%TZ) install.sh $* ==="; } >> "$LOG_FILE"

log()  { echo "[$(date -u +%T)] $*" >> "$LOG_FILE"; }
info() { echo -e "${DIM}  $*${RESET}"; log "$*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; log "OK $*"; }
warn() { echo -e "${YELLOW}! $*${RESET}"; log "WARN $*"; }
fail() { echo -e "${RED}✗ $*${RESET}" >&2; log "FAIL $*"; exit 1; }

# Toute erreur non gérée : ligne + commande fautive + pointeur vers le journal complet.
on_error() {
  local code=$? line=$1 cmd=$2
  # Le piège est hérité par les sous-shells $(…) : on ne rapporte qu'au niveau du script
  [ "$BASHPID" = "$$" ] || return "$code"
  echo -e "${RED}✗ Échec (code $code) ligne $line : ${cmd}${RESET}" >&2
  echo -e "${DIM}  journal complet : $LOG_FILE — l'installation peut être relancée sans risque.${RESET}" >&2
  log "ERROR code=$code line=$line cmd=$cmd"
}
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

# Une seule installation à la fois.
exec 9>/run/homeserver-install.lock
flock -n 9 || fail "Une autre exécution de install.sh est en cours."

# --- Exécution d'une étape : sortie vers le journal, spinner sur un terminal --------
run_step() {
  local msg="$1"; shift
  log "STEP $msg"
  if $VERBOSE; then
    echo -e "${BOLD}→${RESET} $msg"
    if "$@" 2>&1 | tee -a "$LOG_FILE"; then ok "$msg"; return 0; fi
    echo -e "${RED}✗${RESET} $msg"; return 1
  fi
  local out rc=0
  out="$(mktemp)"
  if [ -t 1 ]; then
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0 pid
    printf '%s  ' "$msg"
    "$@" >"$out" 2>&1 </dev/null &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
      printf '\b%s' "${frames[$((i % 10))]}"
      i=$((i + 1))
      sleep 0.1
    done
    wait "$pid" || rc=$?
    if [ "$rc" -eq 0 ]; then printf '\b\033[32m✓\033[0m\n'; else printf '\b\033[31m✗\033[0m\n'; fi
  else
    "$@" >"$out" 2>&1 </dev/null || rc=$?
    if [ "$rc" -eq 0 ]; then echo "✓ $msg"; else echo "✗ $msg"; fi
  fi
  cat "$out" >> "$LOG_FILE"
  if [ "$rc" -ne 0 ]; then
    echo -e "${DIM}  dernières lignes (journal complet : $LOG_FILE) :${RESET}"
    tail -n 25 "$out" | sed 's/^/    /'
  fi
  rm -f "$out"
  return "$rc"
}

# Relance une commande réseau jusqu'à 3 fois (miroirs lents, coupures).
retry() {
  local n=1
  until "$@"; do
    [ "$n" -ge 3 ] && return 1
    echo "tentative $n échouée — nouvel essai dans $((n * 5))s" >&2
    sleep $((n * 5)); n=$((n + 1))
  done
}

# --- Distribution -------------------------------------------------------------------
[ -r /etc/os-release ] || fail "/etc/os-release introuvable — distribution non supportée."
OS_ID="$(. /etc/os-release; echo "${ID:-}")"
OS_LIKE="$(. /etc/os-release; echo "${ID_LIKE:-}")"
OS_PRETTY="$(. /etc/os-release; echo "${PRETTY_NAME:-$OS_ID}")"
case " $OS_ID $OS_LIKE " in
  *" debian "*|*" ubuntu "*) OS_FAMILY=debian ;;
  *" rhel "*|*" fedora "*|*" centos "*|*" rocky "*|*" almalinux "*) OS_FAMILY=rhel ;;
  *) OS_FAMILY=unknown ;;
esac

# --- Désinstallation ----------------------------------------------------------------
if $UNINSTALL; then
  echo -e "${BOLD}→${RESET} Désinstallation de Homeserver"
  echo -e "${DIM}  Supprimera: services systemd, ${INSTALL_DIR}, ${HS_HOME} (releases+états), updater, utilisateur hs-*${RESET}"
  $PURGE && echo -e "${DIM}  --purge : supprimera aussi ${LOG_DIR} et les groupes homeserver*${RESET}"
  echo -e "${DIM}  Conservés : paquets système (Apache/Nginx, MariaDB, PHP…), sites dans /var/www, bases de données${RESET}"
  if ! $ASSUME_YES; then
    [ -r /dev/tty ] || fail "Pas de terminal pour confirmer — relance avec --yes."
    read -r -p "  Continuer ? [y/N] " confirm </dev/tty
    case "$confirm" in
      y|Y|yes|oui|o|O) : ;;
      *) echo "Annulé."; exit 0 ;;
    esac
  fi

  for unit in homeserver hs-helper hs-updater-check.timer hs-updater-check.service hs-updater-apply.service; do
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
  done
  rm -f /etc/systemd/system/homeserver.service /etc/systemd/system/hs-helper.service
  rm -f /etc/systemd/system/hs-updater-check.service /etc/systemd/system/hs-updater-check.timer /etc/systemd/system/hs-updater-apply.service
  systemctl daemon-reload
  systemctl reset-failed homeserver hs-helper >/dev/null 2>&1 || true
  rm -rf /usr/local/lib/homeserver

  # Liens node/npm posés par le helper vers le nvm de hs-* (deviendraient orphelins)
  for bin in node npm npx corepack; do
    link="/usr/local/bin/$bin"
    if [ -L "$link" ] && [[ "$(readlink "$link")" == "$HS_HOME/"* ]]; then rm -f "$link"; fi
  done

  # Vhost du panel (HTTPS) : sinon Apache proxifierait vers un panel absent
  panel_vhost_removed=false
  for f in /etc/apache2/sites-enabled/homeserver-panel.conf /etc/apache2/sites-available/homeserver-panel.conf /etc/httpd/conf.d/homeserver-panel.conf; do
    if [ -e "$f" ] || [ -L "$f" ]; then rm -f "$f"; panel_vhost_removed=true; fi
  done
  if $panel_vhost_removed; then
    systemctl reload apache2 >/dev/null 2>&1 || systemctl reload httpd >/dev/null 2>&1 || true
    info "vhost du panel supprimé"
  fi

  while read -r u; do
    [ -n "$u" ] || continue
    run_step "Suppression de l'utilisateur $u" userdel -f "$u" || true
  done < <(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1}')
  rm -rf "$INSTALL_DIR" "$HS_HOME" /run/homeserver
  if command -v semanage >/dev/null 2>&1; then
    semanage fcontext -d "$HS_HOME/\.nvm/versions/node(/.*)?/bin(/.*)?" >/dev/null 2>&1 || true
  fi

  if $PURGE; then
    for g in homeserver homeserver-web homeserver-sftp; do
      getent group "$g" >/dev/null && { groupdel "$g" 2>/dev/null || warn "groupe $g conservé (encore utilisé)"; }
    done
    trap - ERR
    rm -rf "$LOG_DIR"
  fi
  echo -e "${GREEN}✓ Homeserver désinstallé.${RESET}"
  exit 0
fi

# --- 0. Pré-requis système ------------------------------------------------------------
echo -e "${BOLD}→${RESET} Vérification du système"
[ "$OS_FAMILY" != unknown ] || fail "Distribution non supportée: $OS_PRETTY (Debian/Ubuntu ou RHEL/Rocky/Alma/Fedora requis)."
ok "Distribution : $OS_PRETTY (famille $OS_FAMILY)"

[ -d /run/systemd/system ] || fail "systemd n'est pas le gestionnaire de services actif (conteneur sans systemd ?)."

case "$(uname -m)" in
  x86_64|aarch64|arm64) : ;;
  *) warn "Architecture $(uname -m) non testée — Node.js via nvm peut ne pas être disponible." ;;
esac

mkdir -p "$HS_HOME"
# -Pk (et non -Pm) : les coreutils Rust d'Ubuntu 26.10 refusent les options combinées avec -m
FREE_MB="$(df -Pk "$HS_HOME" | awk 'NR==2 {print int($4 / 1024)}')"
[ "$FREE_MB" -ge "$MIN_FREE_MB" ] || fail "Espace disque insuffisant sur $HS_HOME : ${FREE_MB} Mo libres (${MIN_FREE_MB} Mo requis)."
ok "Espace disque : ${FREE_MB} Mo libres"

# Le build du front (tsc + vite) peut dépasser 1 Go : swap temporaire si la machine est juste.
TMP_SWAP=""
MEM_MB="$(awk '/^MemTotal:/ {t=$2} /^SwapTotal:/ {s=$2} END {print int((t+s)/1024)}' /proc/meminfo)"
cleanup_swap() {
  if [ -n "$TMP_SWAP" ] && [ -f "$TMP_SWAP" ]; then
    swapoff "$TMP_SWAP" 2>/dev/null || true
    rm -f "$TMP_SWAP"
  fi
}
trap cleanup_swap EXIT
if [ "$MEM_MB" -lt 1800 ]; then
  TMP_SWAP="$HS_HOME/.install-swap"
  if { fallocate -l 2G "$TMP_SWAP" 2>/dev/null || dd if=/dev/zero of="$TMP_SWAP" bs=1M count=2048 status=none; } \
     && chmod 600 "$TMP_SWAP" && mkswap "$TMP_SWAP" >/dev/null 2>&1 && swapon "$TMP_SWAP" 2>/dev/null; then
    warn "RAM+swap = ${MEM_MB} Mo : swap temporaire de 2 Go activé pendant l'installation"
  else
    rm -f "$TMP_SWAP"; TMP_SWAP=""
    warn "RAM+swap = ${MEM_MB} Mo et swap temporaire impossible — le build du front risque de manquer de mémoire."
  fi
else
  ok "Mémoire : ${MEM_MB} Mo (RAM+swap)"
fi

# cloud-init (VM fraîches) tient souvent le verrou apt au premier boot.
if command -v cloud-init >/dev/null 2>&1; then
  if ! { cloud-init status 2>/dev/null || true; } | grep -qE 'status: (done|disabled|error)'; then
    # Code de sortie non fiable (2 = terminé avec avertissements) : seul le statut final compte
    run_step "Attente de la fin de cloud-init" bash -c 'timeout 600 cloud-init status --wait >/dev/null 2>&1; cloud-init status | grep -qE "status: (done|disabled|error)"' \
      || warn "cloud-init toujours actif — on continue"
  fi
fi

# Outils de base nécessaires au bootstrap
pkg_install() {
  if [ "$OS_FAMILY" = debian ]; then
    export DEBIAN_FRONTEND=noninteractive
    local apt_opts=(-o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
    retry apt-get "${apt_opts[@]}" update -q && apt-get "${apt_opts[@]}" install -y -q --no-install-recommends "$@"
  else
    # Métadonnées des miroirs parfois injoignables juste après le boot : réessai
    retry dnf install -y -q "$@"
  fi
}
declare -A BASE_PKGS=([curl]=curl [tar]=tar [gzip]=gzip [openssl]=openssl [flock]=util-linux [runuser]=util-linux [find]=findutils [ss]=iproute2 [pgrep]=procps)
[ "$OS_FAMILY" = rhel ] && BASE_PKGS[ss]=iproute && BASE_PKGS[pgrep]=procps-ng
missing=()
for cmd in "${!BASE_PKGS[@]}"; do
  command -v "$cmd" >/dev/null 2>&1 || missing+=("${BASE_PKGS[$cmd]}")
done
[ "$OS_FAMILY" = debian ] && [ ! -e /etc/ssl/certs/ca-certificates.crt ] && missing+=(ca-certificates)
if [ "${#missing[@]}" -gt 0 ]; then
  mapfile -t missing < <(printf '%s\n' "${missing[@]}" | sort -u)
  run_step "Installation des outils de base (${missing[*]})" pkg_install "${missing[@]}" \
    || fail "Impossible d'installer les outils de base (${missing[*]})."
fi
ok "Outils de base présents"

# Connectivité : on échoue tôt et clairement plutôt qu'au milieu du build.
for url in https://registry.npmjs.org/ https://nodejs.org/dist/index.json; do
  "${CURL[@]}" --max-time 20 -o /dev/null "$url" >/dev/null 2>&1 \
    || fail "Accès réseau impossible vers $url (proxy, DNS ou pare-feu sortant ?)."
done
ok "Accès réseau (registry npm, nodejs.org)"

# --- 1. Groupes + utilisateur système hs-* ----------------------------------------------
HS_GROUP="homeserver"
for g in "$HS_GROUP" homeserver-web homeserver-sftp; do
  getent group "$g" >/dev/null || run_step "Création du groupe $g" groupadd "$g"
done
HS_USER="$(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}')"
if [ -n "$HS_USER" ]; then
  ok "Utilisateur existant réutilisé: ${HS_USER}"
else
  HS_USER="hs-$(tr -dc 'a-z' </dev/urandom | head -c 12 || true)"
  [[ "$HS_USER" =~ ^hs-[a-z]{12}$ ]] || fail "Génération du nom d'utilisateur impossible ($HS_USER)."
  run_step "Création de l'utilisateur système $HS_USER (nologin)" \
    useradd -r -M -U -s /usr/sbin/nologin -d "$HS_HOME" -G "$HS_GROUP" "$HS_USER"
fi
id -nG "$HS_USER" | grep -qw "$HS_GROUP" || run_step "Ajout de $HS_USER au groupe $HS_GROUP" usermod -aG "$HS_GROUP" "$HS_USER"
chown "$HS_USER":"$HS_USER" "$HS_HOME"
chmod 750 "$HS_HOME"
mkdir -p "$RELEASES_DIR"
chown "$HS_USER":"$HS_USER" "$RELEASES_DIR"
info "répertoire: $HS_HOME — accès admin: sudo -u $HS_USER <cmd>"

NVM_DIR="$HS_HOME/.nvm"
export NVM_DIR
HS_NODE_BIN_DIR=""
# runuser (util-linux) plutôt que sudo : toujours présent, même sur une Debian minimale.
as_hs() {
  runuser -u "$HS_USER" -- env -i HOME="$HS_HOME" USER="$HS_USER" NVM_DIR="$NVM_DIR" LANG=C.UTF-8 \
    PATH="${HS_NODE_BIN_DIR:+$HS_NODE_BIN_DIR:}/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    ${NVM_NODEJS_ORG_MIRROR:+NVM_NODEJS_ORG_MIRROR="$NVM_NODEJS_ORG_MIRROR"} \
    ${npm_config_registry:+npm_config_registry="$npm_config_registry"} \
    bash -c "cd '$HS_HOME' && $*"
}

# --- 2. Couple updater (core + updater, hors des releases du panel) ----------------------
# L'updater vit dans /usr/local/lib/homeserver/updater/, indépendant du panel.
# S'il est déjà installé et sain, on n'y touche pas ; sinon : HS_UPDATER_TARBALL_URL,
# tarball local updater/dist/, dernière release GitHub, puis assemblage depuis les sources.
install_pair_tarball() {
  # $1 = URL (http/https) OU chemin local vers le tarball du couple
  local src="$1" tmp dir
  tmp="$(mktemp -d)"
  case "$src" in
    http://*|https://*) retry "${CURL[@]}" "$src" -o "$tmp/pair.tar.gz" || { rm -rf "$tmp"; return 1; } ;;
    /*)                 cp "$src" "$tmp/pair.tar.gz" ;;
    *)                  rm -rf "$tmp"; echo "source invalide: $src" >&2; return 1 ;;
  esac
  tar -xzf "$tmp/pair.tar.gz" -C "$tmp" || { rm -rf "$tmp"; return 1; }
  dir="$(find "$tmp" -maxdepth 2 -name VERSION -printf '%h\n' -quit)"
  [ -n "$dir" ] && [ -f "$dir/updater-core.sh" ] && [ -f "$dir/updater.sh" ] || { echo "archive du couple incomplète" >&2; rm -rf "$tmp"; return 1; }
  if [ -f "$dir/SHA256SUMS" ]; then
    (cd "$dir" && sha256sum -c --quiet SHA256SUMS) || { echo "checksum du couple invalide" >&2; rm -rf "$tmp"; return 1; }
  fi
  # Préparation à côté puis bascule : un échec ne laisse jamais un répertoire vide.
  mkdir -p "$(dirname "$PAIR_DIR")"
  rm -rf "$PAIR_DIR.new"
  mkdir -p "$PAIR_DIR.new"
  cp "$dir/updater-core.sh" "$dir/updater.sh" "$dir/VERSION" "$PAIR_DIR.new/"
  chmod 755 "$PAIR_DIR.new/updater-core.sh" "$PAIR_DIR.new/updater.sh"
  rm -rf "$PAIR_DIR"
  mv "$PAIR_DIR.new" "$PAIR_DIR"
  rm -rf "$tmp"
}
if [ -x "$PAIR_DIR/updater-core.sh" ] && [ -x "$PAIR_DIR/updater.sh" ]; then
  info "couple updater déjà présent ($PAIR_DIR) — conservé"
else
  pair_ok=false
  LOCAL_TARBALL="$(find "$SCRIPT_DIR/updater/dist" -maxdepth 1 -name 'homeserver-updater-*.tar.gz' 2>/dev/null | sort -rV | head -1 || true)"
  if [ -n "${HS_UPDATER_TARBALL_URL:-}" ]; then
    run_step "Installation du couple updater (${HS_UPDATER_TARBALL_URL})" install_pair_tarball "$HS_UPDATER_TARBALL_URL" && pair_ok=true
  elif [ -n "$LOCAL_TARBALL" ]; then
    run_step "Installation du couple updater (${LOCAL_TARBALL##*/})" install_pair_tarball "$LOCAL_TARBALL" && pair_ok=true
  else
    UPDATER_LATEST_URL="$("${CURL[@]}" --max-time 20 https://api.github.com/repos/Harkhenon/homeserver-updater/releases/latest 2>/dev/null \
      | grep -o '"browser_download_url": *"[^"]*homeserver-updater-[^"]*\.tar\.gz"' \
      | head -1 | grep -o 'https[^"]*' || true)"
    if [ -n "$UPDATER_LATEST_URL" ]; then
      run_step "Installation du couple updater (dernière release)" install_pair_tarball "$UPDATER_LATEST_URL" && pair_ok=true
    fi
  fi
  if ! $pair_ok && [ -f "$SCRIPT_DIR/updater/make-release.sh" ]; then
    info "assemblage du couple updater depuis les sources locales (updater/)"
    PAIR_BUILD="$(mktemp -d)"
    cp -r "$SCRIPT_DIR/updater/." "$PAIR_BUILD/"
    find "$PAIR_BUILD" -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
    if run_step "Assemblage du couple updater" bash "$PAIR_BUILD/make-release.sh" bootstrap 0.5.0 \
       && run_step "Installation du couple updater (sources locales)" install_pair_tarball "$PAIR_BUILD/dist/homeserver-updater-bootstrap.tar.gz"; then
      pair_ok=true
    fi
    rm -rf "$PAIR_BUILD"
  fi
  $pair_ok || fail "Couple updater introuvable (release GitHub injoignable, pas de updater/dist/ local ni de sources updater/)."
fi
cat > /etc/systemd/system/hs-updater-check.service <<UNIT
[Unit]
Description=Homeserver updater - check périodique
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=$PAIR_DIR/updater-core.sh run check
UNIT
cat > /etc/systemd/system/hs-updater-check.timer <<'UNIT'
[Unit]
Description=Homeserver updater - check toutes les 6h
[Timer]
OnCalendar=*-*-* 00/6:00:00
RandomizedDelaySec=15min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/hs-updater-apply.service <<UNIT
[Unit]
Description=Homeserver updater - application d'une mise à jour
After=network-online.target hs-helper.service
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=$PAIR_DIR/updater-core.sh run apply
TimeoutStartSec=900
UNIT
systemctl daemon-reload
systemctl enable hs-updater-check.timer >/dev/null 2>&1
systemctl restart hs-updater-check.timer
ok "Updater installé ($PAIR_DIR, timer 6h)"

# --- 3. Node.js (nvm, en tant que hs-*) -------------------------------------------------
# Toujours le Node de nvm sous $HS_HOME : c'est celui qu'attendent le helper et l'updater.
nvm_default_node() { as_hs '. "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm which default 2>/dev/null' 2>/dev/null | tail -1 || true; }
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

HS_NODE_BIN="$(nvm_default_node)"
if [ -n "$HS_NODE_BIN" ] && [ -x "$HS_NODE_BIN" ] && [ "$(node_major "$HS_NODE_BIN")" -ge "$NODE_MAJOR_MIN" ]; then
  ok "Node.js $("$HS_NODE_BIN" --version) déjà présent pour ${HS_USER}"
else
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    run_step "Installation de nvm ${NVM_VERSION} pour ${HS_USER}" \
      retry as_hs "curl -fsSL --retry 3 https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | PROFILE=/dev/null bash" \
      || fail "Installation de nvm impossible."
  fi
  run_step "Installation de Node.js ${NODE_TARGET} (LTS) via nvm" \
    retry as_hs '. "$NVM_DIR/nvm.sh" && nvm install '"$NODE_TARGET"' && nvm alias default '"$NODE_TARGET" \
    || fail "Installation de Node.js ${NODE_TARGET} impossible."
  HS_NODE_BIN="$(nvm_default_node)"
fi
[ -n "$HS_NODE_BIN" ] && [ -x "$HS_NODE_BIN" ] || fail "Binaire node introuvable après installation via nvm."
[ "$(node_major "$HS_NODE_BIN")" -ge "$NODE_MAJOR_MIN" ] || fail "Node $("$HS_NODE_BIN" --version) insuffisant (>= $NODE_MAJOR_MIN requis)."
HS_NODE_BIN_DIR="$(dirname "$HS_NODE_BIN")"
HS_NPM_BIN="$HS_NODE_BIN_DIR/npm"
[ -x "$HS_NPM_BIN" ] || fail "npm introuvable à côté de $HS_NODE_BIN."

# SELinux (Fedora/RHEL) : systemd refuse d'exécuter un binaire var_lib_t (status=203/EXEC).
# Node de nvm étiqueté bin_t de façon persistante ; Apache autorisé à proxifier vers le panel
# et les apps Node (127.0.0.1:<port>).
if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then
  command -v semanage >/dev/null 2>&1 \
    || run_step "Installation des outils SELinux (semanage)" pkg_install policycoreutils-python-utils \
    || warn "semanage indisponible — étiquetage SELinux non persistant (chcon)"
  NODE_FCONTEXT="$HS_HOME/\.nvm/versions/node(/.*)?/bin(/.*)?"
  if command -v semanage >/dev/null 2>&1; then
    semanage fcontext -l -C 2>/dev/null | grep -qF "$NODE_FCONTEXT" \
      || run_step "SELinux : contexte bin_t pour Node.js" semanage fcontext -a -t bin_t "$NODE_FCONTEXT"
    restorecon -R "$NVM_DIR/versions/node"
  else
    chcon -R -t bin_t "$NVM_DIR"/versions/node/*/bin
  fi
  if command -v setsebool >/dev/null 2>&1 && [ "$(getsebool httpd_can_network_connect 2>/dev/null | awk '{print $3}')" != on ]; then
    run_step "SELinux : httpd_can_network_connect (reverse-proxy)" setsebool -P httpd_can_network_connect 1 || warn "booléen SELinux httpd_can_network_connect non activé"
  fi
  ok "SELinux configuré pour Homeserver"
fi

# --- 4. Build de la release (à côté de l'actuelle, en tant que hs-*) --------------------
PANEL_VERSION="$("$HS_NODE_BIN" -p "require('$SCRIPT_DIR/package.json').version" 2>/dev/null || true)"
[[ "$PANEL_VERSION" =~ ^[0-9][0-9A-Za-z.-]{0,31}$ ]] || fail "Version illisible dans $SCRIPT_DIR/package.json."
RELEASE_DIR="$RELEASES_DIR/$PANEL_VERSION"
STAGE_DIR="$RELEASES_DIR/.staging-$PANEL_VERSION"
echo -e "${BOLD}→${RESET} Construction de la release ${PANEL_VERSION}"

run_step "Copie des sources" bash -c "
  set -e
  rm -rf '$STAGE_DIR'
  mkdir -p '$STAGE_DIR'
  tar -C '$SCRIPT_DIR' \
    --exclude='./.git' --exclude='./.env' --exclude='./.claude' \
    --exclude='./node_modules' --exclude='./front/node_modules' \
    --exclude='./server/dist' --exclude='./front/dist' \
    --exclude='./dist' --exclude='./updater/dist' \
    -cf - . | tar -C '$STAGE_DIR' -xf -
  # Sources préparées sous Windows : fins de ligne CRLF fatales aux scripts bash
  find '$STAGE_DIR' -type f \\( -name '*.sh' -o -name '*.mjs' \\) -exec sed -i 's/\r\$//' {} +
  echo '$PANEL_VERSION' > '$STAGE_DIR/VERSION'
  chown -R '$HS_USER:$HS_USER' '$STAGE_DIR'
"

NPM_CI="'$HS_NPM_BIN' ci --no-audit --no-fund --loglevel=error"
run_step "Dépendances du back (npm ci)" retry as_hs "cd '$STAGE_DIR' && $NPM_CI" || fail "npm ci (back) a échoué."
run_step "Build du back (server/dist, helper inclus)" as_hs "cd '$STAGE_DIR' && '$HS_NPM_BIN' run build" || fail "Build du back échoué."
test -f "$STAGE_DIR/server/dist/helper/index.js" || fail "server/dist/helper/index.js introuvable après build."
test -f "$STAGE_DIR/server/dist/server/src/index.js" || fail "server/dist/server/src/index.js introuvable après build."
run_step "Dépendances du front (npm ci)" retry as_hs "cd '$STAGE_DIR/front' && $NPM_CI" || fail "npm ci (front) a échoué."
run_step "Build du front" as_hs "cd '$STAGE_DIR/front' && NODE_OPTIONS=--max-old-space-size=1536 '$HS_NPM_BIN' run build" || fail "Build du front échoué."
test -f "$STAGE_DIR/front/dist/index.html" || fail "front/dist/index.html introuvable après build."
# Le front n'a besoin que de dist/ à l'exécution
rm -rf "$STAGE_DIR/front/node_modules"

# Bascule : l'ancienne release du même numéro n'est supprimée qu'une fois la nouvelle en place.
PREVIOUS_VERSION="$(cat "$INSTALL_DIR/current/VERSION" 2>/dev/null || true)"
if [ -d "$RELEASE_DIR" ]; then
  rm -rf "$RELEASE_DIR.old"
  mv "$RELEASE_DIR" "$RELEASE_DIR.old"
fi
mv "$STAGE_DIR" "$RELEASE_DIR"
rm -rf "$RELEASE_DIR.old"

mkdir -p "$INSTALL_DIR"
ln -sfn "$RELEASE_DIR" "$INSTALL_DIR/current"
# Ancienne installation (sources + node_modules directement dans $INSTALL_DIR) : ménage.
# Seuls .env et le lien current y vivent désormais.
case "$(readlink -f "$SCRIPT_DIR")/" in
  "$(readlink -f "$INSTALL_DIR")/"*) warn "install.sh lancé depuis $INSTALL_DIR — ménage de l'ancien layout ignoré" ;;
  *) find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name .env ! -name current -exec rm -rf {} + ;;
esac
chown "$HS_USER:$HS_USER" "$INSTALL_DIR"
chown -h "$HS_USER:$HS_USER" "$INSTALL_DIR/current"
chmod 750 "$INSTALL_DIR"

# installed.json : on conserve l'historique d'une installation précédente
"$HS_NODE_BIN" - "$RELEASES_DIR/installed.json" "$PANEL_VERSION" "$PREVIOUS_VERSION" <<'NODEEOF'
const fs = require('fs');
const [file, cur, prev] = process.argv.slice(2);
let s = {};
try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
// Anciennes installations sans fichier VERSION : la version courante vient de l'état
const before = prev || s.current || '';
s.previous = before && before !== cur ? before : (s.previous ?? null);
s.current = cur;
s.updatedAt = new Date().toISOString();
s.history = [...(s.history ?? []).slice(-19), { version: cur, at: s.updatedAt, status: 'installed' }];
fs.writeFileSync(file + '.tmp', JSON.stringify(s, null, 2));
fs.renameSync(file + '.tmp', file);
NODEEOF
chown "$HS_USER:$HS_USER" "$RELEASES_DIR/installed.json"
ok "Release ${PANEL_VERSION} en place (current -> $RELEASE_DIR)"

# --- 5. Services systemd ----------------------------------------------------------------
cat > /etc/systemd/system/hs-helper.service <<UNIT
[Unit]
Description=Homeserver helper privilégié
After=network.target
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
User=root
Group=$HS_GROUP
Environment=HS_INSTALL_DIR=$INSTALL_DIR
ExecStart=$HS_NODE_BIN $INSTALL_DIR/current/server/dist/helper/index.js
Restart=on-failure
RestartSec=3
RuntimeDirectory=homeserver
RuntimeDirectoryMode=0770

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/homeserver.service <<UNIT
[Unit]
Description=Homeserver panel
After=network.target hs-helper.service
Requires=hs-helper.service
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
User=$HS_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$HS_NODE_BIN $INSTALL_DIR/current/server/dist/server/src/index.js
Restart=on-failure
RestartSec=3
EnvironmentFile=$INSTALL_DIR/.env
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable hs-helper >/dev/null 2>&1
systemctl reset-failed hs-helper homeserver >/dev/null 2>&1 || true
run_step "(Re)démarrage du service hs-helper" systemctl restart hs-helper
for _ in $(seq 1 30); do [ -S /run/homeserver/helper.sock ] && break; sleep 0.5; done
if [ ! -S /run/homeserver/helper.sock ]; then
  journalctl -u hs-helper -n 20 --no-pager >&2 || true
  fail "Le helper ne répond pas (socket /run/homeserver/helper.sock absent)."
fi
ok "Services systemd installés (hs-helper actif)"

# --- 6. Configuration (en tant que hs-*) ------------------------------------------------
NONINTERACTIVE=0
if $ASSUME_YES; then
  NONINTERACTIVE=1
elif [ ! -t 0 ]; then
  # curl … | sudo bash : stdin est le script, les questions passent par le terminal.
  if [ -r /dev/tty ] && { true </dev/tty; } 2>/dev/null; then exec 0</dev/tty; else NONINTERACTIVE=1; fi
fi
[ "$NONINTERACTIVE" = 1 ] && info "mode non interactif (valeurs par défaut / variables HS_*)"
echo -e "${BOLD}→${RESET} Configuration (${HS_USER})"
echo
cd "$INSTALL_DIR"
set +e
runuser -u "$HS_USER" -- env -i \
  PATH="$HS_NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  HOME="$HS_HOME" LANG=C.UTF-8 TERM="${TERM:-dumb}" \
  HS_USER="$HS_USER" HS_HOME="$HS_HOME" HS_INSTALL_DIR="$INSTALL_DIR" \
  HS_NODE_BIN="$HS_NODE_BIN" HS_HELPER_SOCKET=/run/homeserver/helper.sock \
  HS_NONINTERACTIVE="$NONINTERACTIVE" HS_INSTALL_LOG="$LOG_FILE" \
  ${HS_ADMIN_USER:+HS_ADMIN_USER="$HS_ADMIN_USER"} \
  ${HS_PORT:+HS_PORT="$HS_PORT"} \
  ${HS_HOST:+HS_HOST="$HS_HOST"} \
  ${HS_WEB_SERVER:+HS_WEB_SERVER="$HS_WEB_SERVER"} \
  ${HS_PHP_VERSION:+HS_PHP_VERSION="$HS_PHP_VERSION"} \
  ${HS_INSTALL_EXTRAS:+HS_INSTALL_EXTRAS="$HS_INSTALL_EXTRAS"} \
  ${HS_PANEL_DOMAIN:+HS_PANEL_DOMAIN="$HS_PANEL_DOMAIN"} \
  ${HS_LETSENCRYPT_EMAIL:+HS_LETSENCRYPT_EMAIL="$HS_LETSENCRYPT_EMAIL"} \
  "$HS_NODE_BIN" "$RELEASE_DIR/scripts/install.mjs"
MJS_RC=$?
set -e
[ "$MJS_RC" -eq 0 ] || fail "La configuration a échoué (code $MJS_RC) — corrige puis relance : sudo bash $SCRIPT_DIR/scripts/install.sh"

# --- 7. Pare-feu + vérification finale --------------------------------------------------
env_get() { sed -n "s/^$1=//p" "$INSTALL_DIR/.env" 2>/dev/null | tail -1; }
PANEL_PORT="$(env_get HS_PORT)"; PANEL_PORT="${PANEL_PORT:-3000}"
PANEL_HOST="$(env_get HS_HOST)"
PANEL_DOMAIN="$(env_get HS_PANEL_DOMAIN)"

if [ "${HS_SKIP_FIREWALL:-0}" != 1 ]; then
  open_ports=()
  [ "$PANEL_HOST" = "0.0.0.0" ] && open_ports+=("$PANEL_PORT")
  [ -n "$PANEL_DOMAIN" ] && open_ports+=(80 443)
  if [ "${#open_ports[@]}" -gt 0 ]; then
    if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
      for p in "${open_ports[@]}"; do ufw allow "$p/tcp" >/dev/null && info "ufw : port $p/tcp ouvert"; done
    elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
      for p in "${open_ports[@]}"; do firewall-cmd --quiet --permanent --add-port="$p/tcp" && info "firewalld : port $p/tcp ouvert"; done
      firewall-cmd --quiet --reload
    fi
  fi
fi

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$PANEL_PORT/api/health" >/dev/null 2>&1; then healthy=true; break; fi
  sleep 2
done
if ! $healthy; then
  journalctl -u homeserver -n 30 --no-pager >&2 || true
  fail "Le panel ne répond pas sur http://127.0.0.1:$PANEL_PORT/api/health (logs ci-dessus)."
fi
ok "Panel opérationnel (health-check OK)"

SERVER_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<NF;i++) if ($i=="src") {print $(i+1); exit}}')"
SERVER_IP="${SERVER_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
echo
if [ -n "$PANEL_DOMAIN" ] && grep -q '^HS_FORCE_HTTPS=true' "$INSTALL_DIR/.env"; then
  echo -e "  ${BOLD}Panel${RESET}      : https://${PANEL_DOMAIN}"
elif [ "$PANEL_HOST" = "0.0.0.0" ]; then
  echo -e "  ${BOLD}Panel${RESET}      : http://${SERVER_IP:-<IP-serveur>}:${PANEL_PORT}"
else
  echo -e "  ${BOLD}Panel${RESET}      : http://127.0.0.1:${PANEL_PORT} (écoute locale — derrière un reverse-proxy TLS)"
fi
echo -e "  ${DIM}Identifiants : affichés ci-dessus, aussi dans $INSTALL_DIR/.env (root)${RESET}"
echo -e "  ${DIM}Journal      : $LOG_FILE — logs services : journalctl -u homeserver -u hs-helper -f${RESET}"
echo
