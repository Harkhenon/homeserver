#!/usr/bin/env bash
# layout.sh — layout d'exécution de Homeserver (rôle : root uniquement)
#
# Frontière de privilèges : tout ce que root exécute (runtime Node, releases, lien
# current, unités systemd) appartient à root et n'est PAS modifiable par l'utilisateur
# du panel (hs-*). hs-* ne possède que ses données (/var/lib/homeserver) et le .env.
# Les builds (npm ci, tsc, vite) tournent sous un utilisateur dédié sans privilège
# (homeserver-build), distinct de hs-* : un panel compromis ne peut pas empoisonner
# une release pendant sa construction.
#
#   /opt/homeserver/node/              runtime Node (root, lecture seule)
#   /opt/homeserver/releases/<v>/      releases construites (root, lecture seule)
#   /opt/homeserver/releases/installed.json, /opt/homeserver/update-status.json (root)
#   /usr/share/homeserver/             root ; current -> releases/<v> ; .env (hs-*, 0600)
#   /var/lib/homeserver/               HOME + données du panel (hs-*)
#   /var/lib/homeserver-build/         HOME de homeserver-build (root ; cache/ et stage/ à lui)
#
# Usage (install.sh, redeploy.sh et l'updater — depuis l'archive vérifiée) :
#   layout.sh ensure                 runtime Node, répertoires, droits, unités, migration
#   layout.sh build <src> <version>  build isolé puis release root en lecture seule
#   layout.sh switch <version>       bascule atomique de current
set -Eeuo pipefail
umask 022

HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
OPT_DIR=/opt/homeserver
NODE_DIR="$OPT_DIR/node"
RELEASES_DIR="$OPT_DIR/releases"
STATE_FILE="$RELEASES_DIR/installed.json"
CURRENT_LINK="$INSTALL_DIR/current"
PAIR_DIR=/usr/local/lib/homeserver/updater
BUILD_USER=homeserver-build
BUILD_HOME=/var/lib/homeserver-build
HS_GROUP=homeserver
NODE_TARGET="${HS_NODE_TARGET:-22}"
NODE_MAJOR_MIN=20
LEGACY_RELEASES="$HS_HOME/releases"
VERSION_RE='^[0-9][0-9A-Za-z.-]{0,31}$'
CURL=(curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 15)

say() { echo "layout: $*" >&2; }
die() { say "ERREUR : $*"; exit 1; }
[ "$(id -u)" -eq 0 ] || die "root requis"

hs_user() { getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}'; }
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
selinux_on() { command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; }

# --- Runtime Node (archive officielle, checksum vérifié, propriété root) -------------
ensure_node() {
  if [ -x "$NODE_DIR/bin/node" ] && [ "$(node_major "$NODE_DIR/bin/node")" -ge "$NODE_MAJOR_MIN" ]; then
    chown -R root:root "$NODE_DIR"
    chmod -R go-w "$NODE_DIR"
    return 0
  fi
  local arch mirror tmp file expected
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) die "architecture $(uname -m) non supportée par les binaires Node officiels" ;;
  esac
  mirror="${HS_NODE_MIRROR:-${NVM_NODEJS_ORG_MIRROR:-https://nodejs.org/dist}}"
  tmp="$(mktemp -d)"
  "${CURL[@]}" "$mirror/latest-v$NODE_TARGET.x/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt" || die "SHASUMS256.txt de Node injoignable ($mirror)"
  file="$(grep -oE "node-v[0-9.]+-linux-$arch\.tar\.gz" "$tmp/SHASUMS256.txt" | head -1 || true)"
  [ -n "$file" ] || die "archive Node $NODE_TARGET linux-$arch introuvable"
  expected="$(awk -v f="$file" '$2 == f {print $1}' "$tmp/SHASUMS256.txt")"
  "${CURL[@]}" "$mirror/latest-v$NODE_TARGET.x/$file" -o "$tmp/$file" || die "téléchargement de $file impossible"
  [ -n "$expected" ] && [ "$(sha256sum "$tmp/$file" | awk '{print $1}')" = "$expected" ] || die "checksum de $file invalide"
  mkdir -p "$OPT_DIR"
  rm -rf "$NODE_DIR.new"
  mkdir -p "$NODE_DIR.new"
  tar -xzf "$tmp/$file" -C "$NODE_DIR.new" --strip-components=1 --no-same-owner
  chown -R root:root "$NODE_DIR.new"
  chmod -R u=rwX,go=rX "$NODE_DIR.new"
  "$NODE_DIR.new/bin/node" --version >/dev/null || die "binaire Node inutilisable"
  rm -rf "$NODE_DIR.old"
  if [ -d "$NODE_DIR" ]; then mv "$NODE_DIR" "$NODE_DIR.old"; fi
  mv "$NODE_DIR.new" "$NODE_DIR"
  rm -rf "$NODE_DIR.old" "$tmp"
  say "Node $("$NODE_DIR/bin/node" --version) installé dans $NODE_DIR"
}

# SELinux : systemd refuse d'exécuter un binaire mal étiqueté (status=203/EXEC).
ensure_selinux() {
  selinux_on || return 0
  local fc="$NODE_DIR/bin(/.*)?" legacy="$HS_HOME/\.nvm/versions/node(/.*)?/bin(/.*)?" rules
  if command -v semanage >/dev/null 2>&1; then
    rules="$(semanage fcontext -l -C 2>/dev/null || true)"
    if grep -qF "$legacy" <<<"$rules"; then semanage fcontext -d "$legacy" >/dev/null 2>&1 || true; fi
    grep -qF "$fc" <<<"$rules" || semanage fcontext -a -t bin_t "$fc"
    restorecon -R "$OPT_DIR"
  else
    restorecon -R "$OPT_DIR" 2>/dev/null || true
    chcon -R -t bin_t "$NODE_DIR/bin"
  fi
}

# Liens /usr/local/bin vers le Node root (apps Node des utilisateurs, shells).
# On ne remplace que nos propres liens (anciens liens vers le nvm de hs-* compris).
ensure_links() {
  local bin link target cur
  for bin in node npm npx corepack; do
    link="/usr/local/bin/$bin"
    target="$NODE_DIR/bin/$bin"
    [ -e "$target" ] || continue
    if [ -L "$link" ]; then
      cur="$(readlink "$link")"
      case "$cur" in "$HS_HOME"/*|"$NODE_DIR"/*) ln -sfn "$target" "$link" ;; esac
    elif [ ! -e "$link" ]; then
      ln -s "$target" "$link"
    fi
  done
  # Apps Node créées avec un chemin direct vers le nvm de hs-*
  local unit
  for unit in /etc/systemd/system/hs-app-*.service; do
    [ -f "$unit" ] || continue
    if grep -q "^ExecStart=$HS_HOME/" "$unit"; then
      sed -i "s|^ExecStart=$HS_HOME/[^ ]*/node |ExecStart=/usr/local/bin/node |" "$unit"
      UNITS_CHANGED=true
    fi
  done
}

ensure_build_user() {
  getent group "$BUILD_USER" >/dev/null || groupadd -r "$BUILD_USER"
  getent passwd "$BUILD_USER" >/dev/null \
    || useradd -r -M -g "$BUILD_USER" -s /usr/sbin/nologin -d "$BUILD_HOME" -c "Homeserver (builds)" "$BUILD_USER"
  # HOME root : homeserver-build ne peut ni renommer ni remplacer cache/ et stage/
  mkdir -p "$BUILD_HOME/cache" "$BUILD_HOME/stage"
  chown root:root "$BUILD_HOME"
  chmod 755 "$BUILD_HOME"
  chown "$BUILD_USER:$BUILD_USER" "$BUILD_HOME/cache" "$BUILD_HOME/stage"
  chmod 700 "$BUILD_HOME/cache" "$BUILD_HOME/stage"
}

ensure_dirs() {
  local u="$1"
  mkdir -p "$OPT_DIR" "$RELEASES_DIR" "$INSTALL_DIR" "$HS_HOME"
  chown root:root "$OPT_DIR" "$RELEASES_DIR" "$INSTALL_DIR"
  chmod 755 "$OPT_DIR" "$RELEASES_DIR" "$INSTALL_DIR"
  # .env : au panel (hs-*), jamais un lien ; le répertoire root empêche de le remplacer
  if [ -L "$INSTALL_DIR/.env" ] || { [ -e "$INSTALL_DIR/.env" ] && [ ! -f "$INSTALL_DIR/.env" ]; }; then
    rm -f "$INSTALL_DIR/.env"
  fi
  [ -e "$INSTALL_DIR/.env" ] || : > "$INSTALL_DIR/.env"
  chown "$u:$u" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  if [ -L "$CURRENT_LINK" ]; then chown -h root:root "$CURRENT_LINK"; fi
  for f in "$STATE_FILE" "$OPT_DIR/update-status.json"; do
    if [ -e "$f" ]; then chown root:root "$f"; chmod 644 "$f"; fi
  done
  # Données du panel : à hs-*, rien de ce que root exécute n'y vit
  chown "$u:$u" "$HS_HOME"
  chmod 750 "$HS_HOME"
}

# Release en lecture seule : root:root, pas d'écriture pour les autres, pas de
# liens symboliques sortant de la release, pas de secrets copiés par les anciennes versions.
harden_release() {
  local d="$1" l t
  rm -f "$d/.env"
  chown -R root:root "$d"
  chmod -R u=rwX,go=rX "$d"
  while IFS= read -r -d '' l; do
    t="$(readlink -f "$l" 2>/dev/null || true)"
    case "$t" in
      "$d"/*) : ;;
      *) say "lien hors release supprimé : ${l#"$d"/} -> $(readlink "$l")"; rm -f "$l" ;;
    esac
  done < <(find "$d" -type l -print0)
  [ -f "$d/server/dist/helper/index.js" ] && [ ! -L "$d/server/dist/helper/index.js" ] || die "helper absent de la release $d"
}

json_field() { # fichier clé — valeur texte (vide si absente ou invalide)
  "$NODE_DIR/bin/node" -e '
    try { const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]];
          if (typeof v === "string") console.log(v); } catch {}' "$1" "$2" 2>/dev/null || true
}

switch_current() {
  local v="$1"
  [[ "$v" =~ $VERSION_RE ]] && [ -d "$RELEASES_DIR/$v" ] || die "release $v introuvable dans $RELEASES_DIR"
  ln -sfn "$RELEASES_DIR/$v" "$CURRENT_LINK.new"
  mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK" 2>/dev/null || { rm -f "$CURRENT_LINK.new"; ln -sfn "$RELEASES_DIR/$v" "$CURRENT_LINK"; }
  chown -h root:root "$CURRENT_LINK"
}

# Ancien layout (releases et nvm dans le HOME de hs-*, donc modifiables par lui) :
# on rapatrie current et previous en lecture seule (rollback possible), le reste est supprimé.
migrate_legacy() {
  [ -d "$LEGACY_RELEASES" ] && [ ! -L "$LEGACY_RELEASES" ] || return 0
  local cur prev v d
  cur="$(readlink "$CURRENT_LINK" 2>/dev/null || true)"
  case "$cur" in "$LEGACY_RELEASES"/*) cur="${cur#"$LEGACY_RELEASES"/}"; cur="${cur%/}" ;; *) cur="" ;; esac
  prev="$(json_field "$LEGACY_RELEASES/installed.json" previous)"
  for v in "$cur" "$prev"; do
    [[ "$v" =~ $VERSION_RE ]] || continue
    d="$LEGACY_RELEASES/$v"
    [ -d "$d" ] && [ ! -L "$d" ] && [ ! -e "$RELEASES_DIR/$v" ] || continue
    rm -rf "$RELEASES_DIR/.incoming-$v"
    mv "$d" "$RELEASES_DIR/.incoming-$v"
    if ( harden_release "$RELEASES_DIR/.incoming-$v" ); then
      mv "$RELEASES_DIR/.incoming-$v" "$RELEASES_DIR/$v"
      say "release $v migrée vers $RELEASES_DIR (lecture seule)"
    else
      rm -rf "$RELEASES_DIR/.incoming-$v"
    fi
  done
  # installed.json était modifiable par hs-* : réécrit (versions validées, historique conservé)
  if [ ! -f "$STATE_FILE" ]; then
    "$NODE_DIR/bin/node" - "$LEGACY_RELEASES/installed.json" "$STATE_FILE" "$cur" "$RELEASES_DIR" <<'NODEEOF' || true
const fs = require('fs');
const [src, dst, cur, dir] = process.argv.slice(2);
const ok = (v) => typeof v === 'string' && /^[0-9][0-9A-Za-z.-]{0,31}$/.test(v) && fs.existsSync(`${dir}/${v}`);
let s = {};
try { s = JSON.parse(fs.readFileSync(src, 'utf8')); } catch {}
const out = {
  current: ok(cur) ? cur : null,
  previous: ok(s.previous) ? s.previous : null,
  updatedAt: new Date().toISOString(),
  history: (Array.isArray(s.history) ? s.history : []).slice(-20)
    .filter((h) => h && /^[0-9][0-9A-Za-z.-]{0,31}$/.test(String(h.version ?? '')))
    .map((h) => ({ version: String(h.version), at: String(h.at ?? ''), status: String(h.status ?? '').slice(0, 20) })),
};
fs.writeFileSync(dst + '.tmp', JSON.stringify(out, null, 2), { mode: 0o644 });
fs.renameSync(dst + '.tmp', dst);
NODEEOF
  fi
  if [ -n "$cur" ] && [ -d "$RELEASES_DIR/$cur" ]; then switch_current "$cur"; fi
  rm -rf "$LEGACY_RELEASES"
  rm -f "$HS_HOME/update-status.json" "$HS_HOME/updater.lock" "$HS_HOME/.install-swap"
  say "ancien layout migré ($HS_HOME/releases supprimé)"
}

write_unit() { # nom contenu — n'écrit (et ne recharge) que si le contenu change
  local f="/etc/systemd/system/$1"
  if [ "$(cat "$f" 2>/dev/null || true)" != "$2" ]; then
    printf '%s\n' "$2" > "$f.tmp"
    chmod 644 "$f.tmp"
    mv -f "$f.tmp" "$f"
    UNITS_CHANGED=true
  fi
}

ensure_units() {
  local u="$1"
  # Helper root : il installe des paquets, gère des utilisateurs, écrit dans /etc, /home et
  # /var/www, pilote le pare-feu. Le durcissement se limite à ce qui ne casse pas ces
  # usages (pas de ProtectSystem/ProtectHome/NoNewPrivileges : apt/dnf, useradd, SELinux).
  write_unit hs-helper.service "[Unit]
Description=Homeserver helper privilégié
After=network.target
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
User=root
Group=$HS_GROUP
Environment=HS_INSTALL_DIR=$INSTALL_DIR
ExecStart=$NODE_DIR/bin/node $CURRENT_LINK/server/dist/helper/index.js
Restart=on-failure
RestartSec=3
RuntimeDirectory=homeserver
RuntimeDirectoryMode=0750
UMask=0022
PrivateTmp=yes
ProtectKernelLogs=yes
ProtectHostname=yes
LockPersonality=yes
RestrictRealtime=yes
RestrictNamespaces=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
SystemCallArchitectures=native
SystemCallFilter=~@clock @cpu-emulation @debug @obsolete @raw-io @reboot @swap
SystemCallErrorNumber=EPERM
CapabilityBoundingSet=~CAP_SYS_BOOT CAP_SYS_TIME CAP_WAKE_ALARM CAP_BLOCK_SUSPEND CAP_SYS_RAWIO CAP_SYS_PTRACE CAP_LEASE CAP_SYSLOG CAP_SYS_TTY_CONFIG

[Install]
WantedBy=multi-user.target"

  # Panel (hs-*) : aucun privilège, système en lecture seule sauf ses données.
  write_unit homeserver.service "[Unit]
Description=Homeserver panel
After=network.target hs-helper.service
Requires=hs-helper.service
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
User=$u
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_DIR/bin/node $CURRENT_LINK/server/dist/server/src/index.js
Restart=on-failure
RestartSec=3
EnvironmentFile=$INSTALL_DIR/.env
UMask=0077
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=$HS_HOME
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
RemoveIPC=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
SystemCallErrorNumber=EPERM
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target"

  local updater_hardening="PrivateTmp=yes
ProtectHome=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectHostname=yes
LockPersonality=yes
RestrictRealtime=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
SystemCallArchitectures=native
UMask=0022"
  write_unit hs-updater-check.service "[Unit]
Description=Homeserver updater - check périodique
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=$PAIR_DIR/updater-core.sh run check
$updater_hardening"
  write_unit hs-updater-check.timer "[Unit]
Description=Homeserver updater - check toutes les 6h
[Timer]
OnCalendar=*-*-* 00/6:00:00
RandomizedDelaySec=15min
Persistent=true
[Install]
WantedBy=timers.target"
  write_unit hs-updater-apply.service "[Unit]
Description=Homeserver updater - application d'une mise à jour
After=network-online.target hs-helper.service
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=$PAIR_DIR/updater-core.sh run apply
TimeoutStartSec=1800
$updater_hardening"
}

# .env conservé d'une version à l'autre : un module ajouté depuis ne se chargerait jamais.
ensure_modules() {
  local env="$INSTALL_DIR/.env" mods
  [ -f "$env" ] || return 0
  mods="$(sed -n 's/^HS_MODULES=//p' "$env" | tail -1)"
  [ -n "$mods" ] || return 0
  case ",$mods," in
    *,mail,*) ;;
    *) sed -i "s/^HS_MODULES=.*/HS_MODULES=$mods,mail/" "$env"; say "module mail ajouté à HS_MODULES" ;;
  esac
}

cmd_ensure() {
  local u
  u="$(hs_user)"
  [ -n "$u" ] || die "aucun utilisateur hs-* (lance install.sh)"
  UNITS_CHANGED=false
  ensure_node
  ensure_selinux
  ensure_build_user
  ensure_dirs "$u"
  migrate_legacy
  ensure_links
  ensure_units "$u"
  ensure_modules
  if $UNITS_CHANGED; then systemctl daemon-reload; fi
  # nvm de hs-* : plus rien ne l'utilise une fois les unités basculées sur $NODE_DIR
  if [ -d "$HS_HOME/.nvm" ] && ! grep -qs "$HS_HOME/.nvm" /etc/systemd/system/homeserver.service /etc/systemd/system/hs-helper.service; then
    rm -rf "$HS_HOME/.nvm"
    say "nvm de $u supprimé (runtime : $NODE_DIR)"
  fi
}

# Tue tout processus de homeserver-build (un paquet npm malveillant pourrait laisser
# un démon modifier la sortie du build pendant sa copie par root).
kill_build_user() {
  local i
  for i in 1 2 3 4 5; do
    pkill -KILL -u "$BUILD_USER" 2>/dev/null || true
    pgrep -u "$BUILD_USER" >/dev/null 2>&1 || return 0
    sleep 1
  done
  die "processus de $BUILD_USER impossibles à arrêter"
}

as_build() {
  runuser -u "$BUILD_USER" -- env -i HOME="$BUILD_HOME/cache" USER="$BUILD_USER" LANG=C.UTF-8 \
    PATH="$NODE_DIR/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    npm_config_cache="$BUILD_HOME/cache/npm" npm_config_update_notifier=false \
    ${npm_config_registry:+npm_config_registry="$npm_config_registry"} \
    bash -c "cd '$BUILD_HOME/stage/src' && $1"
}

cmd_build() {
  local src="$1" version="$2" stage incoming dest
  [[ "$version" =~ $VERSION_RE ]] || die "version invalide : $version"
  [ -f "$src/package.json" ] || die "$src/package.json introuvable"
  [ -x "$NODE_DIR/bin/node" ] || die "runtime Node absent (layout.sh ensure)"
  ensure_build_user
  kill_build_user
  stage="$BUILD_HOME/stage/src"
  rm -rf "$stage"
  mkdir -p "$stage"
  say "copie des sources"
  tar -C "$src" \
    --exclude='./.git' --exclude='./.env' --exclude='./.claude' \
    --exclude='./node_modules' --exclude='./front/node_modules' \
    --exclude='./server/dist' --exclude='./front/dist' \
    --exclude='./dist' --exclude='./updater/dist' \
    -cf - . | tar -C "$stage" --no-same-owner -xf -
  # Sources préparées sous Windows : fins de ligne CRLF fatales aux scripts bash
  find "$stage" -type f \( -name '*.sh' -o -name '*.mjs' \) -exec sed -i 's/\r$//' {} +
  echo "$version" > "$stage/VERSION"
  chown -R "$BUILD_USER:$BUILD_USER" "$stage"

  local npm_ci="npm ci --no-audit --no-fund --loglevel=error"
  say "dépendances du back (npm ci)"
  as_build "$npm_ci" || as_build "$npm_ci" || die "npm ci (back) a échoué"
  say "build du back (server/dist, helper inclus)"
  as_build "npm run build" || die "build du back échoué"
  say "dépendances du front (npm ci)"
  as_build "cd front && $npm_ci" || as_build "cd front && $npm_ci" || die "npm ci (front) a échoué"
  say "build du front"
  as_build "cd front && NODE_OPTIONS=--max-old-space-size=1536 npm run build" || die "build du front échoué"
  kill_build_user
  [ -d "$stage" ] && [ ! -L "$stage" ] || die "répertoire de build altéré"
  for f in server/dist/helper/index.js server/dist/server/src/index.js front/dist/index.html; do
    [ -f "$stage/$f" ] || die "$f introuvable après build"
  done
  # Le front n'a besoin que de dist/ à l'exécution
  rm -rf "$stage/front/node_modules"

  say "installation en lecture seule dans $RELEASES_DIR/$version"
  incoming="$RELEASES_DIR/.incoming-$version"
  dest="$RELEASES_DIR/$version"
  rm -rf "$incoming"
  mkdir -p "$incoming"
  tar -C "$stage" -cf - . | tar -C "$incoming" --no-same-owner -xf -
  rm -rf "$stage"
  harden_release "$incoming"
  # L'ancienne release du même numéro n'est supprimée qu'une fois la nouvelle en place
  if [ -d "$dest" ]; then
    rm -rf "$RELEASES_DIR/.old-$version"
    mv "$dest" "$RELEASES_DIR/.old-$version"
  fi
  mv "$incoming" "$dest"
  rm -rf "$RELEASES_DIR/.old-$version"
  selinux_on && restorecon -R "$dest" 2>/dev/null || true
  echo "$dest"
}

case "${1:-}" in
  ensure) cmd_ensure ;;
  build)  [ $# -eq 3 ] || die "usage : layout.sh build <src> <version>"; cmd_build "$2" "$3" ;;
  switch) [ $# -eq 2 ] || die "usage : layout.sh switch <version>"; switch_current "$2" ;;
  *) echo "Usage : layout.sh {ensure|build <src> <version>|switch <version>}" >&2; exit 1 ;;
esac
