#!/usr/bin/env bash
# updater.sh — logique complète de mise à jour du panel Homeserver.
# Versionnée avec le couple (voir VERSION). Le core le lance et peut le réparer.
# Modes :
#   check : check des releases GitHub (panel + updater), self-update du couple, écrit update-status.json
#   apply : vérifie la signature de la release, la construit (scripts/layout.sh de l'archive
#           vérifiée : utilisateur homeserver-build, release root en lecture seule),
#           bascule atomique, health-check, rollback auto
#   state : lit et affiche les fichiers d'état (contrats schema 1)
set -euo pipefail

#=== BEGIN INJECTED pair.sh (généré par make-release.sh, ne pas éditer) ===
___PAIR_SH___
#=== END INJECTED pair.sh ===

# Tout l'état écrit par root vit dans des répertoires root (jamais dans le HOME de hs-*,
# où un lien symbolique planté redirigerait nos écritures).
HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
OPT_DIR=/opt/homeserver
RELEASES_DIR="$OPT_DIR/releases"
CURRENT_LINK="$INSTALL_DIR/current"
STATE_FILE="$RELEASES_DIR/installed.json"
STATUS_FILE="$OPT_DIR/update-status.json"
LOCK_FILE=/run/homeserver-updater.lock
# Port réel du panel : le .env fait foi (le service updater n'hérite pas de HS_PORT)
PANEL_PORT="$(grep -m1 '^HS_PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -dc '0-9' || true)"
PANEL_PORT="${PANEL_PORT:-3000}"
PANEL_REPO_API="${PANEL_REPO_API:-https://api.github.com/repos/Harkhenon/homeserver/releases/latest}"
KEEP_RELEASES="${HS_KEEP_RELEASES:-5}"
MIN_FREE_MB="${HS_MIN_FREE_MB:-1024}"
NODE_BIN="$OPT_DIR/node/bin/node"
LOG_FILE=/var/log/homeserver/updater.log
VERSION_RE='^[0-9][0-9A-Za-z.-]{0,31}$'

mkdir -p "$(dirname "$LOG_FILE")" "$OPT_DIR"
log() { echo "[$(date -u +%FT%TZ)] updater: $1" >> "$LOG_FILE"; }
json_set() { # file node value  (fusion minimaliste sans dépendances, écriture atomique)
  "$NODE_BIN" - "$1" "$2" "$3" <<'NODEEOF'
const fs = require('fs');
const [file, key, rawVal] = process.argv.slice(2);
let obj = {};
try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
let val;
try { val = JSON.parse(rawVal); } catch { val = rawVal; }
const keys = key.split('.');
let cur = obj;
for (const k of keys.slice(0, -1)) { cur[k] = cur[k] ?? {}; cur = cur[k]; }
cur[keys[keys.length - 1]] = val;
fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2), { mode: 0o644 });
fs.renameSync(file + '.tmp', file);
NODEEOF
  mirror_legacy_status
}

# Panel encore sur l'ancien layout (helper qui lit $HS_HOME/update-status.json) : copie
# de l'état pour qu'il voie la mise à jour disponible. Écriture sûre dans un répertoire
# possédé par hs-* : création exclusive (O_EXCL, refuse un lien planté) puis renommage.
mirror_legacy_status() {
  [ -d "$HS_HOME/releases" ] && [ ! -L "$HS_HOME/releases" ] && [ -f "$STATUS_FILE" ] || return 0
  local tmp="$HS_HOME/.update-status.$$.$RANDOM"
  ( set -C; cat "$STATUS_FILE" > "$tmp" ) 2>/dev/null || return 0
  chmod 644 "$tmp"
  mv -f "$tmp" "$HS_HOME/update-status.json" 2>/dev/null || rm -f "$tmp"
}

fail_run() { # message — échec d'apply consigné dans le contrat
  json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": $(printf '%s' "$1" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(d)))")}"
  log "échec : $1"
  exit 1
}

semver_gt() { # a b -> true si a > b
  [ "$(printf '%s\n%s' "$2" "$1" | sort -V | tail -1)" = "$1" ] && [ "$1" != "$2" ]
}

github_latest() { # api_url — tolérant aux échecs (rate limit, réseau) : renvoie null
  local out
  out="$(curl -fsSL --connect-timeout 15 "$1" 2>/dev/null || true)"
  if [ -z "$out" ]; then echo "null"; return 0; fi
  printf '%s' "$out" | "$NODE_BIN" -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try { const j=JSON.parse(d); console.log(JSON.stringify({version: j.tag_name.replace(/^v/,''), notes: j.body ?? '', assets: (j.assets ?? []).map(a => a.browser_download_url)})); }
  catch { console.log('null'); }
});"
}

ensure_node() {
  # Runtime root du nouveau layout ; avant migration, repli sur l'ancien lien (layout.sh
  # ensure, lancé par l'apply, installe le runtime root et migre le reste).
  if [ ! -x "$NODE_BIN" ] && [ -x /usr/local/bin/node ]; then NODE_BIN=/usr/local/bin/node; fi
  [ -x "$NODE_BIN" ] || { echo "node introuvable" >&2; return 1; }
}

disk_ok() {
  local free_mb
  # -Pk (et non -Pm) : les coreutils Rust d'Ubuntu 26.10 refusent les options combinées avec -m
  free_mb="$(df -Pk "$OPT_DIR" | awk 'NR==2 {print int($4 / 1024)}')"
  [ "$free_mb" -ge "$MIN_FREE_MB" ]
}

take_lock() { # mode — une seule instance (check ou apply) à la fois
  exec 8>"$LOCK_FILE"
  flock -n 8
}

current_version() {
  local v
  v="$(cat "$CURRENT_LINK/VERSION" 2>/dev/null || true)"
  [ -n "$v" ] || v="$("$NODE_BIN" -e "try{console.log(require('$STATE_FILE').current||'')}catch{}" 2>/dev/null || true)"
  [[ "$v" =~ $VERSION_RE ]] && echo "$v" || echo none
}

# ---------------------------------------------------------------- MODE state
mode_state() {
  cat "$STATUS_FILE" 2>/dev/null || echo '{}'
}

# ---------------------------------------------------------------- MODE check
mode_check() {
  ensure_node
  # Verrou : ne jamais checker pendant un apply (le panel poll, le timer aussi)
  if ! take_lock; then
    log "check ignoré : apply en cours"
    exit 0
  fi
  # Écraser un lastRun "running" obsolète (apply tué par timeout systemd sans ménage)
  "$NODE_BIN" - "$STATUS_FILE" <<'NODEEOF' 2>/dev/null || true
const fs = require('fs');
const f = process.argv[2];
try {
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (s.lastRun && s.lastRun.result === 'running') {
    const started = Date.parse(s.lastRun.at);
    if (Number.isFinite(started) && Date.now() - started > 30 * 60_000) {
      s.lastRun = { at: s.lastRun.at, result: 'failed', message: 'apply interrompu (timeout) — état nettoyé par le check' };
      fs.writeFileSync(f + '.tmp', JSON.stringify(s, null, 2), { mode: 0o644 });
      fs.renameSync(f + '.tmp', f);
    }
  }
} catch {}
NODEEOF
  log "check démarré"

  # 1. Self-update du couple (l'outillage se répare sans attendre — Var 4/A)
  local pair_latest pair_local pair_updated="false" PAIR_VER
  pair_latest="$(github_latest "$UPDATER_REPO_API" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('null')}})")"
  pair_local="$(pair_local_version)"
  if [ "$pair_latest" != "null" ] && [ -n "$pair_latest" ] && semver_gt "$pair_latest" "$pair_local"; then
    local repair_out
    if repair_out="$(pair_repair 2>&1)"; then
      pair_updated="true"
      log "couple self-updaté $pair_local -> $pair_latest"
    else
      log "échec self-update couple (continu) : $repair_out"
    fi
  fi

  # 2. Check panel
  local latest_json latest_version
  latest_json="$(github_latest "$PANEL_REPO_API")"
  PAIR_VER="$(pair_local_version)"
  if [ "$latest_json" = "null" ]; then
    json_set "$STATUS_FILE" lastCheck "$(date -u +%FT%TZ)"
    json_set "$STATUS_FILE" available false
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"API GitHub injoignable (rate limit ou réseau) — nouvel essai au prochain check\"}"
    json_set "$STATUS_FILE" updaterHealth "{\"core\": \"ok\", \"updater\": \"ok\", \"pairVersion\": \"$PAIR_VER\", \"selfUpdated\": $pair_updated, \"checkedAt\": \"$(date -u +%FT%TZ)\"}"
    log "check échoué : API GitHub injoignable"
    cat "$STATUS_FILE"
    exit 0
  fi
  latest_version="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('unknown')}})")"
  [[ "$latest_version" =~ $VERSION_RE ]] || latest_version=unknown
  local current available=false
  current="$(current_version)"
  [ "$latest_version" != "unknown" ] && [ "$current" != "none" ] && semver_gt "$latest_version" "$current" && available=true

  # 3. Écriture du contrat update-status.json (schema 1)
  local notes
  notes="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d).notes||''))}catch{console.log('\"\"')}})")"
  json_set "$STATUS_FILE" schema 1
  json_set "$STATUS_FILE" lastCheck "$(date -u +%FT%TZ)"
  json_set "$STATUS_FILE" available "$available"
  if [ "$available" = "true" ]; then
    json_set "$STATUS_FILE" latest "{\"version\": \"$latest_version\", \"notes\": $notes}"
  else
    json_set "$STATUS_FILE" latest null
  fi
  json_set "$STATUS_FILE" updaterHealth "{\"core\": \"ok\", \"updater\": \"ok\", \"pairVersion\": \"$PAIR_VER\", \"selfUpdated\": $pair_updated, \"checkedAt\": \"$(date -u +%FT%TZ)\"}"
  log "check terminé: current=$current latest=$latest_version available=$available"
  cat "$STATUS_FILE"
}

# ---------------------------------------------------------------- MODE apply
mode_apply() {
  ensure_node
  if ! take_lock; then
    log "apply ignoré : une autre instance tourne"
    exit 1
  fi
  log "apply démarré"
  json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"running\", \"message\": \"mise à jour en cours\"}"

  # 0. Garde-fous : disque + version dispo
  disk_ok || fail_run "espace disque insuffisant (< ${MIN_FREE_MB} Mo)"
  local latest_json latest_version current
  latest_json="$(github_latest "$PANEL_REPO_API")"
  latest_version="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('unknown')}})")"
  current="$(current_version)"
  if ! [[ "$latest_version" =~ $VERSION_RE ]] || ! semver_gt "$latest_version" "$current"; then
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"noop\", \"message\": \"déjà à jour ($current)\"}"
    log "rien à faire (current=$current)"; exit 0
  fi
  log "apply: version cible $latest_version (courante $current)"

  # 1. Asset officiel + signature obligatoires (plus de repli sur l'archive non signée du tag)
  local tar_url sig_url
  tar_url="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const a=(j.assets||[]).find(u=>typeof u==='string'&&u.endsWith('/homeserver-v'+j.version+'.tar.gz'));console.log(a||'')})")"
  [ -n "$tar_url" ] || fail_run "release $latest_version sans archive officielle — mise à jour refusée"
  sig_url="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const u=process.argv[1]+'.sig';console.log((j.assets||[]).includes(u)?u:'')})" "$tar_url")"
  [ -n "$sig_url" ] || fail_run "release $latest_version non signée — mise à jour refusée"
  APPLY_TMP="$(mktemp -d)"; local tmp="$APPLY_TMP"
  trap 'rm -rf "${APPLY_TMP:-}"' EXIT
  log "apply: téléchargement $tar_url"
  curl -fsSL "$tar_url" -o "$tmp/panel.tar.gz" && curl -fsSL "$sig_url" -o "$tmp/panel.tar.gz.sig" || fail_run "téléchargement impossible"
  pair_verify "$tmp/panel.tar.gz" "$tmp/panel.tar.gz.sig" || fail_run "signature de la release $latest_version invalide — mise à jour refusée"
  log "apply: signature vérifiée"
  mkdir "$tmp/src"
  tar -xzf "$tmp/panel.tar.gz" -C "$tmp/src" --no-same-owner || fail_run "archive illisible"
  local src_dir pkg_version
  src_dir="$(find "$tmp/src" -maxdepth 2 -name package.json -printf '%h\n' -quit 2>/dev/null)"
  [ -n "$src_dir" ] || fail_run "package.json introuvable"
  # Une archive signée plus ancienne republiée sous un nouveau tag est refusée
  pkg_version="$("$NODE_BIN" -p "require('$src_dir/package.json').version" 2>/dev/null || true)"
  [ "$pkg_version" = "$latest_version" ] || fail_run "version de l'archive ($pkg_version) différente du tag ($latest_version)"
  [ -f "$src_dir/scripts/layout.sh" ] || fail_run "release $latest_version incompatible avec cet updater (scripts/layout.sh absent)"

  # 2. Panel minimum requis par le couple
  local panel_min
  panel_min="$(grep -o '"panelMin": *"[^"]*"' "$PAIR_DIR/VERSION" 2>/dev/null | grep -o '[0-9.]*' || echo '')"
  if [ -n "$panel_min" ] && [ "$current" != "none" ] && semver_gt "$panel_min" "$current"; then
    fail_run "panel trop ancien pour cet updater (min $panel_min), mets à jour manuellement"
  fi

  # 3. Layout root (runtime Node, droits, unités, migration) puis build À CÔTÉ de l'actuelle
  log "apply: layout + build (journal détaillé ci-dessous)"
  bash "$src_dir/scripts/layout.sh" ensure >>"$LOG_FILE" 2>&1 || fail_run "préparation du layout"
  NODE_BIN="$OPT_DIR/node/bin/node"
  current="$(current_version)"
  bash "$src_dir/scripts/layout.sh" build "$src_dir" "$latest_version" >>"$LOG_FILE" 2>&1 || fail_run "build de la release $latest_version"
  local new_dir="$RELEASES_DIR/$latest_version"

  # 4. Bascule + health-check + rollback automatique
  log "apply: builds OK, bascule du symlink"
  bash "$src_dir/scripts/layout.sh" switch "$latest_version" >>"$LOG_FILE" 2>&1 || fail_run "bascule impossible"
  systemctl restart hs-helper homeserver
  sleep 5
  local healthy=false
  for _ in 1 2 3 4 5 6; do
    if systemctl is-active --quiet homeserver && curl -fsS "http://127.0.0.1:$PANEL_PORT/api/health" >/dev/null 2>&1; then
      healthy=true; break
    fi
    sleep 5
  done

  if $healthy; then
    "$NODE_BIN" - "$STATE_FILE" "$current" "$latest_version" <<'NODEEOF'
const fs = require('fs');
const [file, prev, cur] = process.argv.slice(2);
let s = {};
try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
s.previous = prev === 'none' ? null : prev;
s.current = cur;
s.updatedAt = new Date().toISOString();
s.history = [...(s.history ?? []).slice(-19), { version: cur, at: s.updatedAt, status: 'ok' }];
fs.writeFileSync(file + '.tmp', JSON.stringify(s, null, 2), { mode: 0o644 });
fs.renameSync(file + '.tmp', file);
NODEEOF
    # Ménage auto : garder KEEP_RELEASES dernières (jamais la courante ni la précédente)
    local d v
    while IFS= read -r d; do
      v="$(basename "$d")"
      [[ "$v" =~ $VERSION_RE ]] && [ "$v" != "$latest_version" ] && [ "$v" != "$current" ] || continue
      rm -rf "$RELEASES_DIR/$v"
    done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '.*' | sort -rV | tail -n +"$((KEEP_RELEASES + 1))")
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"ok\", \"message\": \"panel mis à jour vers $latest_version\"}"
    json_set "$STATUS_FILE" available false
    json_set "$STATUS_FILE" latest null
    log "apply OK: $current -> $latest_version"
  else
    # Rollback
    if [ "$current" != "none" ] && [ -d "$RELEASES_DIR/$current" ]; then
      bash "$src_dir/scripts/layout.sh" switch "$current" >>"$LOG_FILE" 2>&1 || true
      systemctl restart hs-helper homeserver
    fi
    rm -rf "$new_dir"
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"rolledBack\", \"message\": \"health-check échoué — retour à $current\"}"
    log "apply ÉCHEC (rollback vers $current)"
    exit 1
  fi
}

case "${1:-check}" in
  check)  mode_check ;;
  apply)  mode_apply ;;
  state)  mode_state ;;
  *) echo "Usage: updater.sh {check|apply|state}" >&2; exit 1 ;;
esac
