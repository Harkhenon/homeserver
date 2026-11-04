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
#   HS_UPDATER_TARBALL_URL source du couple updater (URL signée .sig, ou chemin local)
#   HS_NODE_MIRROR         miroir des binaires Node.js           [https://nodejs.org/dist]
#   HS_SKIP_FIREWALL=1     ne pas ouvrir le port du panel dans ufw/firewalld
#   HS_INSTALL_MAIL=yes    active le service e-mail (activable sinon depuis le panel)
#   HS_MAIL_HOSTNAME       nom d'hôte du serveur de mail (requis avec HS_INSTALL_MAIL)
set -Eeuo pipefail
umask 022

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; DIM='\033[2m'; RESET='\033[0m'
if [ ! -t 1 ]; then BOLD=''; CYAN=''; GREEN=''; YELLOW=''; RED=''; DIM=''; RESET=''; fi

usage() { sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; }

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
HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
# Tout ce que root exécute vit sous /opt/homeserver (root, lecture seule) : voir scripts/layout.sh
OPT_DIR=/opt/homeserver
RELEASES_DIR="$OPT_DIR/releases"
HS_NODE_BIN="$OPT_DIR/node/bin/node"
LAYOUT=(bash "$SCRIPT_DIR/scripts/layout.sh")
PUBKEY_FILE="$SCRIPT_DIR/keys/release-signing.pub.pem"
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
  echo -e "${DIM}  Supprimera: services systemd, ${INSTALL_DIR}, ${OPT_DIR} (Node + releases), ${HS_HOME} (données), updater, utilisateurs hs-* et homeserver-build${RESET}"
  $PURGE && echo -e "${DIM}  --purge : supprimera aussi ${LOG_DIR} et les groupes homeserver*${RESET}"
  echo -e "${DIM}  Conservés : paquets système (Apache/Nginx, MariaDB, PHP…), fail2ban et ses jails, sites dans /var/www, bases de données, boîtes e-mail (sauf --purge)${RESET}"
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

  # Liens node/npm vers notre runtime (ou l'ancien nvm de hs-*) : deviendraient orphelins
  for bin in node npm npx corepack; do
    link="/usr/local/bin/$bin"
    if [ -L "$link" ] && [[ "$(readlink "$link")" == "$HS_HOME/"* || "$(readlink "$link")" == "$OPT_DIR/"* ]]; then rm -f "$link"; fi
  done

  # Service e-mail : configuration retirée, boîtes conservées sauf avec --purge
  if [ -f /var/lib/homeserver-mail/state.json ]; then
    systemctl disable --now postfix dovecot opendkim hs-mail-policy rspamd clamav-daemon clamav-freshclam >/dev/null 2>&1 || true
    rm -f /etc/fail2ban/filter.d/postfix.local /etc/fail2ban/filter.d/dovecot.local /etc/dovecot/sieve/homeserver-spam.sieve /etc/dovecot/sieve/homeserver-spam.svbin
    if [ -d /etc/rspamd/local.d ]; then
      grep -lF 'Généré par Homeserver' /etc/rspamd/local.d/* 2>/dev/null | xargs -r rm -f
    fi
    rm -f /etc/systemd/system/hs-mail-policy.service
    rm -rf /etc/postfix/homeserver /etc/dovecot/homeserver-users /etc/homeserver-mail /etc/systemd/system/opendkim.service.d/zz-homeserver.conf
    rm -f /etc/letsencrypt/renewal-hooks/deploy/homeserver-mail.sh
    rm -f /etc/apache2/sites-enabled/homeserver-mail-autoconfig.conf /etc/apache2/sites-available/homeserver-mail-autoconfig.conf /etc/httpd/conf.d/homeserver-mail-autoconfig.conf
    rm -f /etc/nginx/sites-enabled/homeserver-mail-autoconfig.conf /etc/nginx/sites-available/homeserver-mail-autoconfig.conf /etc/nginx/conf.d/homeserver-mail-autoconfig.conf
    rm -rf /var/www/homeserver-mail
    if [ -f /etc/dovecot/dovecot.conf.homeserver-orig ]; then mv -f /etc/dovecot/dovecot.conf.homeserver-orig /etc/dovecot/dovecot.conf; fi
    if [ -f /etc/opendkim.conf.homeserver-orig ]; then mv -f /etc/opendkim.conf.homeserver-orig /etc/opendkim.conf; fi
    systemctl daemon-reload
    if $PURGE; then
      rm -rf /var/vmail /var/lib/homeserver-mail /etc/opendkim/keys /var/backups/homeserver/mail
      userdel vmail >/dev/null 2>&1 || true
      info "service e-mail retiré, messages et clés DKIM supprimés"
    else
      info "service e-mail retiré ; messages conservés dans /var/vmail, état dans /var/lib/homeserver-mail (--purge pour les supprimer)"
    fi
  fi

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
  if getent passwd homeserver-build >/dev/null; then
    pkill -KILL -u homeserver-build 2>/dev/null || true
    run_step "Suppression de l'utilisateur homeserver-build" userdel homeserver-build || true
  fi
  getent group homeserver-build >/dev/null && { groupdel homeserver-build 2>/dev/null || true; }
  rm -rf "$INSTALL_DIR" "$HS_HOME" "$OPT_DIR" /var/lib/homeserver-build /run/homeserver
  if command -v semanage >/dev/null 2>&1; then
    semanage fcontext -d "$HS_HOME/\.nvm/versions/node(/.*)?/bin(/.*)?" >/dev/null 2>&1 || true
    semanage fcontext -d "$OPT_DIR/node/bin(/.*)?" >/dev/null 2>&1 || true
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
  *) fail "Architecture $(uname -m) non supportée (binaires Node.js officiels : x86_64, aarch64)." ;;
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
  # Hors du HOME de hs-* : un lien planté là ferait écrire fallocate/mkswap ailleurs
  TMP_SWAP=/var/homeserver-install.swap
  rm -f "$TMP_SWAP"
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
info "données du panel : $HS_HOME — accès admin : sudo -u $HS_USER <cmd>"

# Vérification Ed25519 (openssl) d'une archive signée par la CI de release.
verify_signature() { # fichier signature
  openssl pkeyutl -verify -pubin -inkey "$PUBKEY_FILE" -rawin -in "$1" -sigfile "$2" >/dev/null 2>&1
}

# --- 2. Couple updater (core + updater, hors des releases du panel) ----------------------
# L'updater vit dans /usr/local/lib/homeserver/updater/ (root), indépendant du panel.
# Source : HS_UPDATER_TARBALL_URL (archive signée) sinon les sources updater/ livrées avec
# ce dépôt. Un couple déjà installé n'est remplacé que s'il est plus ancien ou abîmé.
install_pair_tarball() {
  # $1 = URL (http/https, signature .sig obligatoire) OU chemin local vers le tarball du couple
  local src="$1" tmp dir
  tmp="$(mktemp -d)"
  case "$src" in
    http://*|https://*)
      retry "${CURL[@]}" "$src" -o "$tmp/pair.tar.gz" || { rm -rf "$tmp"; return 1; }
      retry "${CURL[@]}" "$src.sig" -o "$tmp/pair.tar.gz.sig" || { echo "signature $src.sig introuvable" >&2; rm -rf "$tmp"; return 1; }
      verify_signature "$tmp/pair.tar.gz" "$tmp/pair.tar.gz.sig" || { echo "signature du couple invalide" >&2; rm -rf "$tmp"; return 1; } ;;
    /*) cp "$src" "$tmp/pair.tar.gz" ;;
    *)  rm -rf "$tmp"; echo "source invalide: $src" >&2; return 1 ;;
  esac
  mkdir "$tmp/x"
  tar -xzf "$tmp/pair.tar.gz" -C "$tmp/x" --no-same-owner || { rm -rf "$tmp"; return 1; }
  dir="$(find "$tmp/x" -maxdepth 2 -name VERSION -printf '%h\n' -quit)"
  [ -n "$dir" ] && [ -f "$dir/updater-core.sh" ] && [ -f "$dir/updater.sh" ] || { echo "archive du couple incomplète" >&2; rm -rf "$tmp"; return 1; }
  if [ -f "$dir/SHA256SUMS" ]; then
    (cd "$dir" && sha256sum -c --quiet SHA256SUMS) || { echo "checksum du couple invalide" >&2; rm -rf "$tmp"; return 1; }
  fi
  # Préparation à côté puis bascule : un échec ne laisse jamais un répertoire vide.
  mkdir -p "$(dirname "$PAIR_DIR")"
  rm -rf "$PAIR_DIR.new"
  mkdir -p "$PAIR_DIR.new"
  cp "$dir/updater-core.sh" "$dir/updater.sh" "$dir/VERSION" "$PAIR_DIR.new/"
  chown -R root:root "$PAIR_DIR.new"
  chmod 755 "$PAIR_DIR.new" "$PAIR_DIR.new/updater-core.sh" "$PAIR_DIR.new/updater.sh"
  chmod 644 "$PAIR_DIR.new/VERSION"
  rm -rf "$PAIR_DIR"
  mv "$PAIR_DIR.new" "$PAIR_DIR"
  rm -rf "$tmp"
}
pair_version() { grep -o '"version": *"[^"]*"' "$1" 2>/dev/null | head -1 | grep -o '[0-9][^"]*' || true; }
version_lt() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]; }
LOCAL_PAIR_VERSION="$(tr -dc '0-9.' < "$SCRIPT_DIR/updater/VERSION" 2>/dev/null || true)"
INSTALLED_PAIR_VERSION="$(pair_version "$PAIR_DIR/VERSION")"
if [ -n "${HS_UPDATER_TARBALL_URL:-}" ]; then
  run_step "Installation du couple updater (${HS_UPDATER_TARBALL_URL})" install_pair_tarball "$HS_UPDATER_TARBALL_URL" \
    || fail "Installation du couple updater depuis HS_UPDATER_TARBALL_URL impossible."
elif [ -x "$PAIR_DIR/updater-core.sh" ] && [ -x "$PAIR_DIR/updater.sh" ] && [ -n "$INSTALLED_PAIR_VERSION" ] \
     && { [ -z "$LOCAL_PAIR_VERSION" ] || ! version_lt "$INSTALLED_PAIR_VERSION" "$LOCAL_PAIR_VERSION"; }; then
  info "couple updater $INSTALLED_PAIR_VERSION déjà présent ($PAIR_DIR) — conservé"
else
  [ -f "$SCRIPT_DIR/updater/make-release.sh" ] && [ -n "$LOCAL_PAIR_VERSION" ] || fail "Sources du couple updater absentes ($SCRIPT_DIR/updater)."
  PAIR_BUILD="$(mktemp -d)"
  cp -r "$SCRIPT_DIR/updater/." "$PAIR_BUILD/"
  find "$PAIR_BUILD" -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
  if ! { run_step "Assemblage du couple updater $LOCAL_PAIR_VERSION" bash "$PAIR_BUILD/make-release.sh" "$LOCAL_PAIR_VERSION" \
       && run_step "Installation du couple updater $LOCAL_PAIR_VERSION${INSTALLED_PAIR_VERSION:+ (remplace $INSTALLED_PAIR_VERSION)}" \
            install_pair_tarball "$PAIR_BUILD/dist/homeserver-updater-$LOCAL_PAIR_VERSION.tar.gz"; }; then
    rm -rf "$PAIR_BUILD"
    fail "Installation du couple updater impossible."
  fi
  rm -rf "$PAIR_BUILD"
fi

# --- 3. Runtime Node, layout root, unités systemd (scripts/layout.sh) ---------------------
# SELinux : outils pour l'étiquetage persistant du runtime Node ; Apache autorisé à
# proxifier vers le panel et les apps Node (127.0.0.1:<port>).
if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then
  command -v semanage >/dev/null 2>&1 \
    || run_step "Installation des outils SELinux (semanage)" pkg_install policycoreutils-python-utils \
    || warn "semanage indisponible — étiquetage SELinux non persistant (chcon)"
  if command -v setsebool >/dev/null 2>&1 && [ "$(getsebool httpd_can_network_connect 2>/dev/null | awk '{print $3}')" != on ]; then
    run_step "SELinux : httpd_can_network_connect (reverse-proxy)" setsebool -P httpd_can_network_connect 1 || warn "booléen SELinux httpd_can_network_connect non activé"
  fi
fi
run_step "Runtime Node.js, droits et unités systemd (layout root)" "${LAYOUT[@]}" ensure \
  || fail "Préparation du layout impossible (voir $LOG_FILE)."
[ -x "$HS_NODE_BIN" ] || fail "Binaire node introuvable ($HS_NODE_BIN)."
ok "Node.js $("$HS_NODE_BIN" --version) ($OPT_DIR/node, root) — releases dans $RELEASES_DIR"
systemctl enable hs-updater-check.timer >/dev/null 2>&1
systemctl restart hs-updater-check.timer
ok "Updater installé ($PAIR_DIR, timer 6h)"

# --- 4. Build de la release (utilisateur homeserver-build), installée en lecture seule --
PANEL_VERSION="$("$HS_NODE_BIN" -p "require('$SCRIPT_DIR/package.json').version" 2>/dev/null || true)"
[[ "$PANEL_VERSION" =~ ^[0-9][0-9A-Za-z.-]{0,31}$ ]] || fail "Version illisible dans $SCRIPT_DIR/package.json."
RELEASE_DIR="$RELEASES_DIR/$PANEL_VERSION"
run_step "Construction de la release ${PANEL_VERSION} (npm ci + builds, utilisateur homeserver-build)" \
  "${LAYOUT[@]}" build "$SCRIPT_DIR" "$PANEL_VERSION" || fail "Build de la release échoué (voir $LOG_FILE)."

PREVIOUS_VERSION="$(cat "$INSTALL_DIR/current/VERSION" 2>/dev/null || true)"
"${LAYOUT[@]}" switch "$PANEL_VERSION"
# Ancienne installation (sources + node_modules directement dans $INSTALL_DIR) : ménage.
# Seuls .env et le lien current y vivent désormais.
case "$(readlink -f "$SCRIPT_DIR")/" in
  "$(readlink -f "$INSTALL_DIR")/"*) warn "install.sh lancé depuis $INSTALL_DIR — ménage de l'ancien layout ignoré" ;;
  *) find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name .env ! -name current -exec rm -rf {} + ;;
esac

# installed.json (root) : on conserve l'historique d'une installation précédente
"$HS_NODE_BIN" - "$RELEASES_DIR/installed.json" "$PANEL_VERSION" "$PREVIOUS_VERSION" "$RELEASES_DIR" <<'NODEEOF'
const fs = require('fs');
const [file, cur, prev, dir] = process.argv.slice(2);
let s = {};
try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
// Anciennes installations sans fichier VERSION : la version courante vient de l'état
const before = prev || s.current || '';
s.previous = before && before !== cur && fs.existsSync(`${dir}/${before}`) ? before : (s.previous && s.previous !== cur && fs.existsSync(`${dir}/${s.previous}`) ? s.previous : null);
s.current = cur;
s.updatedAt = new Date().toISOString();
s.history = [...(s.history ?? []).slice(-19), { version: cur, at: s.updatedAt, status: 'installed' }];
fs.writeFileSync(file + '.tmp', JSON.stringify(s, null, 2), { mode: 0o644 });
fs.renameSync(file + '.tmp', file);
NODEEOF
ok "Release ${PANEL_VERSION} en place (current -> $RELEASE_DIR, root, lecture seule)"

# --- 5. Services systemd ----------------------------------------------------------------
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
  PATH="$OPT_DIR/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
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
  ${HS_INSTALL_MAIL:+HS_INSTALL_MAIL="$HS_INSTALL_MAIL"} \
  ${HS_MAIL_HOSTNAME:+HS_MAIL_HOSTNAME="$HS_MAIL_HOSTNAME"} \
  ${HS_PANEL_DOMAIN:+HS_PANEL_DOMAIN="$HS_PANEL_DOMAIN"} \
  ${HS_LETSENCRYPT_EMAIL:+HS_LETSENCRYPT_EMAIL="$HS_LETSENCRYPT_EMAIL"} \
  "$HS_NODE_BIN" "$RELEASE_DIR/scripts/install.mjs"
MJS_RC=$?
set -e
[ "$MJS_RC" -eq 0 ] || fail "La configuration a échoué (code $MJS_RC) — corrige puis relance : sudo bash $SCRIPT_DIR/scripts/install.sh"

# --- 7. Pare-feu + vérification finale --------------------------------------------------
env_get() { sed -n "s/^$1=//p" "$INSTALL_DIR/.env" 2>/dev/null | tail -1; }
# .env modifiable par hs-* : valeurs filtrées avant usage par root
PANEL_PORT="$(env_get HS_PORT | tr -dc 0-9)"; PANEL_PORT="${PANEL_PORT:-3000}"
PANEL_HOST="$(env_get HS_HOST | tr -dc 0-9.)"
PANEL_DOMAIN="$(env_get HS_PANEL_DOMAIN | tr -dc a-z0-9.-)"

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
echo -e "  ${DIM}Identifiants : affichés ci-dessus (mot de passe hashé dans $HS_HOME/auth.json, jamais en clair dans .env)${RESET}"
echo -e "  ${DIM}Journal      : $LOG_FILE — logs services : journalctl -u homeserver -u hs-helper -f${RESET}"
echo
