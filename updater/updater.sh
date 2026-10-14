#!/usr/bin/env bash
# updater.sh — logique complète de mise à jour du panel Homeserver.
# Versionnée avec le couple (voir VERSION). Le core le lance et peut le réparer.
# Modes :
#   check : check des releases GitHub (panel + updater), self-update du couple, écrit update-status.json
#   apply : build d'une nouvelle release du panel, bascule atomique, health-check, rollback auto
#   state : lit et affiche les fichiers d'état (contrats schema 1)
set -euo pipefail

#=== BEGIN INJECTED pair.sh (généré par make-release.sh, ne pas éditer) ===
___PAIR_SH___
#=== END INJECTED pair.sh ===

HS_HOME="${HS_HOME:-/var/lib/homeserver}"
INSTALL_DIR="${INSTALL_DIR:-/usr/share/homeserver}"
RELEASES_DIR="$HS_HOME/releases"
CURRENT_LINK="$INSTALL_DIR/current"
STATE_FILE="$RELEASES_DIR/installed.json"
STATUS_FILE="$HS_HOME/update-status.json"
PANEL_PORT="${HS_PORT:-3000}"
PANEL_REPO_API="${PANEL_REPO_API:-https://api.github.com/repos/Harkhenon/homeserver/releases/latest}"
KEEP_RELEASES="${HS_KEEP_RELEASES:-5}"
MIN_FREE_MB="${HS_MIN_FREE_MB:-1024}"
NODE_BIN="${HS_NODE_BIN:-/usr/local/bin/node}"
NPM_BIN="$(dirname "$NODE_BIN")/npm"
LOG_FILE="${HS_UPDATER_LOG:-/var/log/homeserver/updater.log}"

log() { echo "[$(date -u +%FT%TZ)] updater: $1" >> "$LOG_FILE"; }
json_set() { # file node value  (fusion minimaliste sans dépendances)
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
fs.writeFileSync(file, JSON.stringify(obj, null, 2));
NODEEOF
}

semver_gt() { # a b -> true si a > b
  [ "$(printf '%s\n%s' "$2" "$1" | sort -V | tail -1)" = "$1" ] && [ "$1" != "$2" ]
}

github_latest() { # api_url — tolérant aux échecs (rate limit, réseau) : renvoie null
  local out
  out="$(curl -fsSL "$1" 2>/dev/null || true)"
  if [ -z "$out" ]; then echo "null"; return 0; fi
  printf '%s' "$out" | "$NODE_BIN" -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try { const j=JSON.parse(d); console.log(JSON.stringify({version: j.tag_name.replace(/^v/,''), notes: j.body ?? '', assets: (j.assets ?? []).map(a => a.browser_download_url)})); }
  catch { console.log('null'); }
});"
}

ensure_node() {
  if [ ! -x "$NODE_BIN" ]; then
    local nvm_node
    nvm_node="$(find "$HS_HOME/.nvm/versions/node" -maxdepth 3 -name node -type f -print -quit 2>/dev/null)"
    [ -n "$nvm_node" ] && NODE_BIN="$nvm_node" && NPM_BIN="$(dirname "$nvm_node")/npm"
  fi
  [ -x "$NODE_BIN" ] || { echo "node introuvable" >&2; return 1; }
}

disk_ok() {
  local free_mb
  free_mb="$(df -Pm "$HS_HOME" | awk 'NR==2 {print $4}')"
  [ "$free_mb" -ge "$MIN_FREE_MB" ]
}

# ---------------------------------------------------------------- MODE state
mode_state() {
  ensure_node
  cat "$STATUS_FILE" 2>/dev/null || echo '{}'
}

# ---------------------------------------------------------------- MODE check
LOCK_FILE="$HS_HOME/updater.lock"

mode_check() {
  ensure_node
  # Verrou : ne jamais checker pendant un apply (le panel poll, le timer aussi)
  if [ -f "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
    log "check ignoré : apply en cours"
    exit 0
  fi
  echo $$ > "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
  touch "$STATUS_FILE"
  # Écraser un lastRun "running" obsolète (apply tué par timeout systemd sans ménage)
  if [ -x "$NODE_BIN" ] || ensure_node 2>/dev/null; then
    "$NODE_BIN" - "$STATUS_FILE" <<'NODEEOF' 2>/dev/null || true
const fs = require('fs');
const f = process.argv[2];
try {
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (s.lastRun && s.lastRun.result === 'running') {
    const started = Date.parse(s.lastRun.at);
    if (Number.isFinite(started) && Date.now() - started > 15 * 60_000) {
      s.lastRun = { at: s.lastRun.at, result: 'failed', message: 'apply interrompu (timeout) — état nettoyé par le check' };
      fs.writeFileSync(f, JSON.stringify(s, null, 2));
    }
  }
} catch {}
NODEEOF
  fi
  log "check démarré"

  # 1. Self-update du couple (l'outillage se répare sans attendre — Var 4/A)
  local pair_latest pair_local
  pair_latest="$(github_latest "$UPDATER_REPO_API" version)"
  pair_local="$(pair_local_version)"
  local pair_updated="false"
  local PAIR_VER
  if [ "$pair_latest" != "null" ] && [ -n "$pair_latest" ] && semver_gt "$pair_latest" "$pair_local"; then
    if pair_repair >/dev/null 2>&1; then
      pair_updated="true"
      log "couple self-updaté $pair_local -> $pair_latest"
    else
      log "échec self-update couple (continu)"
    fi
  fi

  # 2. Check panel
  local latest_json latest_version
  latest_json="$(github_latest "$PANEL_REPO_API" full)"
  if [ "$latest_json" = "null" ]; then
    json_set "$STATUS_FILE" lastCheck "$(date -u +%FT%TZ)"
    json_set "$STATUS_FILE" available false
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"API GitHub injoignable (rate limit ou réseau) — nouvel essai au prochain check\"}"
    PAIR_VER="$(pair_local_version)"
    json_set "$STATUS_FILE" updaterHealth "{\"core\": \"ok\", \"updater\": \"ok\", \"pairVersion\": \"$PAIR_VER\", \"selfUpdated\": $pair_updated, \"checkedAt\": \"$(date -u +%FT%TZ)\"}"
    log "check échoué : API GitHub injoignable"
    cat "$STATUS_FILE"
    exit 0
  fi
  latest_version="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('unknown')}})")"
  local current
  current="$(cat "$RELEASES_DIR/current/VERSION" 2>/dev/null || "$NODE_BIN" -e "try{console.log(require('$STATE_FILE').current||'unknown')}catch{console.log('unknown')}" 2>/dev/null || echo unknown)"
  local available=false
  [ "$latest_version" != "unknown" ] && [ "$current" != "unknown" ] && semver_gt "$latest_version" "$current" && available=true

  # 3. Écriture du contrat update-status.json (schema 1)
  local notes
  notes="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).notes||'')}catch{console.log('')}})")"
  json_set "$STATUS_FILE" schema 1
  json_set "$STATUS_FILE" lastCheck "$(date -u +%FT%TZ)"
  json_set "$STATUS_FILE" available "$available"
  if [ "$available" = "true" ]; then
    json_set "$STATUS_FILE" latest "{\"version\": \"$latest_version\", \"notes\": $(printf '%s' "$notes" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(d)))")}"
  else
    json_set "$STATUS_FILE" latest null
  fi
  PAIR_VER="$(pair_local_version)"
  json_set "$STATUS_FILE" updaterHealth "{\"core\": \"ok\", \"updater\": \"ok\", \"pairVersion\": \"$PAIR_VER\", \"selfUpdated\": $pair_updated, \"checkedAt\": \"$(date -u +%FT%TZ)\"}"
  log "check terminé: current=$current latest=$latest_version available=$available"
  cat "$STATUS_FILE"
}

# ---------------------------------------------------------------- MODE apply
mode_apply() {
  ensure_node
  if [ -f "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
    log "apply ignoré : une autre instance tourne"
    exit 1
  fi
  echo $$ > "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
  touch "$STATUS_FILE"
  log "apply démarré"

  json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"running\", \"message\": \"mise à jour en cours\"}"
  log "apply: état running écrit"

  # 0. Garde-fous : disque + version dispo
  log "apply: garde-fou disque"
  if ! disk_ok; then
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"espace disque insuffisant (< ${MIN_FREE_MB} Mo)\"}"
    log "échec: espace disque insuffisant"; exit 1
  fi
  local latest_json latest_version
  latest_json="$(github_latest "$PANEL_REPO_API" full)"
  latest_version="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('unknown')}})")"
  local current previous
  current="$("$NODE_BIN" -e "try{console.log(require('$STATE_FILE').current||'none')}catch{console.log('none')}" 2>/dev/null || echo none)"
  previous="$("$NODE_BIN" -e "try{console.log(require('$STATE_FILE').previous||'none')}catch{console.log('none')}" 2>/dev/null || echo none)"
  if [ "$latest_version" = "unknown" ] || ! semver_gt "$latest_version" "$current"; then
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"noop\", \"message\": \"déjà à jour ($current)\"}"
    log "rien à faire (current=$current)"; exit 0
  fi

  log "apply: version cible $latest_version (courante $current)"
  # 1. Télécharger le tarball de la release du panel (asset, sinon archive du tag)
  local tar_url
  tar_url="$(printf '%s' "$latest_json" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const asset=(j.assets||[]).find(a=>a.includes('homeserver-v'));console.log(asset||`https://github.com/Harkhenon/homeserver/archive/refs/tags/v${j.version}.tar.gz`)})")"
  local tmp
  tmp="$(mktemp -d)"
  log "apply: téléchargement $tar_url"
  curl -fsSL "$tar_url" -o "$tmp/panel.tar.gz" || { json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"téléchargement impossible\"}"; log "échec téléchargement"; exit 1; }
  tar -xzf "$tmp/panel.tar.gz" -C "$tmp" || { json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"archive illisible\"}"; exit 1; }
  local src_dir
  src_dir="$(find "$tmp" -maxdepth 2 -name package.json -printf '%h\n' -quit 2>/dev/null)"
  [ -n "$src_dir" ] || { json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"package.json introuvable\"}"; exit 1; }

  # 2. Panel minimum requis par le couple
  local panel_min
  panel_min="$(grep -o '"panelMin": *"[^"]*"' "$PAIR_DIR/VERSION" 2>/dev/null | grep -o '[0-9.]*' || echo '')"
  if [ -n "$panel_min" ] && [ "$current" != "none" ] && semver_gt "$panel_min" "$current"; then
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"panel trop ancien pour cet updater (min $panel_min), mets à jour manuellement\"}"
    log "panelMin non satisfait"; exit 1
  fi

  # 3. Build de la nouvelle release À CÔTÉ de l'actuelle (bascule atomique)
  local new_dir="$RELEASES_DIR/$latest_version"
  rm -rf "$new_dir"
  mkdir -p "$new_dir"
  tar -C "$src_dir" \
    --exclude='./.git' --exclude='./.env' \
    --exclude='./node_modules' --exclude='./front/node_modules' \
    -cf - . | tar -C "$new_dir" -xf -
  if [ -f "$INSTALL_DIR/.env" ]; then cp "$INSTALL_DIR/.env" "$new_dir/.env"; fi
  log "apply: sources copiées, npm ci back"

  local hs_user
  hs_user="$(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}')"
  chown -R "$hs_user:$hs_user" "$new_dir"

  local as_hs="sudo -u $hs_user -H HOME=$HS_HOME PATH=$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin:/sbin"
  $as_hs bash -c "cd '$new_dir' && '$NPM_BIN' ci --no-audit --no-fund" >/dev/null 2>&1 || { json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"npm ci back\"}"; exit 1; }
  $as_hs bash -c "cd '$new_dir' && '$NPM_BIN' run build" >/dev/null 2>&1 || { json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"build back\"}"; exit 1; }
  $as_hs bash -c "cd '$new_dir/front' && '$NPM_BIN' ci --no-audit --no-fund" >/dev/null 2>&1 || { json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"npm ci front\"}"; exit 1; }
  $as_hs bash -c "cd '$new_dir/front' && '$NPM_BIN' run build" >/dev/null 2>&1 || { json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"build front\"}"; exit 1; }

  [ -f "$new_dir/server/dist/server/src/index.js" ] || { json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"failed\", \"message\": \"artefacts manquants\"}"; exit 1; }
  echo "$latest_version" > "$new_dir/VERSION"

  # 4. Bascule + health-check + rollback automatique
  log "apply: builds OK, bascule du symlink"
  ln -sfn "$new_dir" "$CURRENT_LINK"
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
fs.writeFileSync(file, JSON.stringify(s, null, 2));
NODEEOF
    # Ménage auto : garder KEEP_RELEASES dernières
    ls -1d "$RELEASES_DIR"/*/ 2>/dev/null | sort -rV | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"ok\", \"message\": \"panel mis à jour vers $latest_version\"}"
    json_set "$STATUS_FILE" available false
    json_set "$STATUS_FILE" latest null
    log "apply OK: $current -> $latest_version"
    rm -rf "$tmp"
  else
    # Rollback
    if [ "$current" != "none" ] && [ -d "$RELEASES_DIR/$current" ]; then
      ln -sfn "$RELEASES_DIR/$current" "$CURRENT_LINK"
      systemctl restart hs-helper homeserver
    fi
    json_set "$STATUS_FILE" lastRun "{\"at\": \"$(date -u +%FT%TZ)\", \"result\": \"rolledBack\", \"message\": \"health-check échoué — retour à $current\"}"
    log "apply ÉCHEC (rollback vers $current)"
    rm -rf "$tmp" "$new_dir"
    exit 1
  fi
}

case "${1:-check}" in
  check)  mode_check ;;
  apply)  mode_apply ;;
  state)  mode_state ;;
  *) echo "Usage: updater.sh {check|apply|state}" >&2; exit 1 ;;
esac
