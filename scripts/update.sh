#!/usr/bin/env bash
# Homeserver — mise à jour du panel par releases atomiques (non interactif, appelé par le helper)
#
# Layout :
#   /var/lib/homeserver/releases/<version>/   une release autonome (server/dist, front/dist, package*.json)
#   /var/lib/homeserver/releases/installed.json  état courant
#   /usr/share/homeserver/current -> symlink vers la release active (Utilisé par systemd)
#
# Usage :
#   bash scripts/update.sh --check           # {"current":..., "latest":..., "available":...}
#   bash scripts/update.sh --apply           # build nouvelle release + bascule + health-check
#   bash scripts/update.sh --rollback        # retour à la release précédente
#   bash scripts/update.sh --releases        # liste des releases
set -euo pipefail

MODE="apply"
VERBOSE=false
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --apply) MODE="apply" ;;
    --rollback) MODE="rollback" ;;
    --releases) MODE="releases" ;;
    --verbose|-v) VERBOSE=true ;;
    *) echo "Option inconnue: $arg" >&2; exit 1 ;;
  esac
done

fail() { echo "$1" >&2; exit 1; }
logv() { $VERBOSE && echo "-> $1" >&2 || true; }

HS_HOME=/var/lib/homeserver
INSTALL_DIR=/usr/share/homeserver
RELEASES_DIR="$HS_HOME/releases"
STATE_FILE="$RELEASES_DIR/installed.json"
CURRENT_LINK="$INSTALL_DIR/current"
# Le script peut être exécuté depuis la release active (current/scripts/) qui n'a pas de .git :
# le dépôt git source est soit le clone de travail, soit déclaré via HS_SRC_DIR.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d "$SCRIPT_DIR/.git" ]; then
  SRC_DIR="$SCRIPT_DIR"
else
  SRC_DIR="${HS_SRC_DIR:-}"
  if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR/.git" ]; then
    for cand in /root/homeserver /opt/homeserver /srv/homeserver "$HS_HOME/homeserver"; do
      if [ -d "$cand/.git" ]; then SRC_DIR="$cand"; break; fi
    done
  fi
fi
BRANCH="${HS_UPDATE_BRANCH:-main}"
PANEL_PORT="${HS_PORT:-3000}"
KEEP_RELEASES="${HS_KEEP_RELEASES:-5}"

[ -d "$SRC_DIR/.git" ] || fail "Dépôt git introuvable (essayé: $SRC_DIR). Clone le dépôt quelque part et définis HS_SRC_DIR dans le .env du helper."
[ -d "$INSTALL_DIR" ] || fail "$INSTALL_DIR introuvable — lance d'abord scripts/install.sh."

HS_USER="$(getent passwd | awk -F: '$1 ~ /^hs-/ {print $1; exit}')"
[ -n "$HS_USER" ] || fail "Aucun utilisateur hs-* trouvé."

NVM_DIR="$HS_HOME/.nvm"
export NVM_DIR
test -s "$NVM_DIR/nvm.sh" || fail "nvm introuvable dans $NVM_DIR."
HS_NODE_BIN="$(sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -c '. "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm which current' 2>/dev/null || true)"
[ -n "$HS_NODE_BIN" ] || HS_NODE_BIN="$(sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -c '. "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm which default' 2>/dev/null || true)"
[ -n "$HS_NODE_BIN" ] || fail "Node.js introuvable pour $HS_USER."
HS_NPM_BIN="$(dirname "$HS_NODE_BIN")/npm"
HS_NODE_BIN_DIR="$(dirname "$HS_NODE_BIN")"

# Exécute une commande en tant que l'utilisateur hs-* (arguments en une seule chaîne)
ash() { sudo -u "$HS_USER" -H HOME="$HS_HOME" NVM_DIR="$NVM_DIR" PATH="$HS_NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"; }

read_state() {
  [ -f "$STATE_FILE" ] || echo '{"current": null, "previous": null, "history": []}'
  [ -f "$STATE_FILE" ] && cat "$STATE_FILE" || true
}

write_state() {
  local json="$1"
  mkdir -p "$RELEASES_DIR"
  printf '%s' "$json" > "$STATE_FILE"
  chown "$HS_USER:$HS_USER" "$STATE_FILE"
}

# --- MODE check ------------------------------------------------------------------------
if [ "$MODE" = "check" ]; then
  git -C "$SRC_DIR" fetch origin "$BRANCH" --tags >/dev/null 2>&1 || fail "git fetch impossible (réseau ?)"
  CUR="unknown"; LAT="unknown"
  if [ -f "$STATE_FILE" ] && [ -n "$HS_NODE_BIN" ]; then
    CUR="$("$HS_NODE_BIN" -e "console.log(JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8')).current || 'unknown')" 2>/dev/null || echo unknown)"
  fi
  LAT="$(git -C "$SRC_DIR" show "origin/$BRANCH:package.json" 2>/dev/null \
    | "$HS_NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('unknown')}})" \
    || echo unknown)"
  AVAIL="false"
  [ "$CUR" != "unknown" ] && [ "$LAT" != "unknown" ] && [ "$CUR" != "$LAT" ] && AVAIL="true"
  echo "{\"current\": \"$CUR\", \"latest\": \"$LAT\", \"available\": $AVAIL, \"branch\": \"$BRANCH\"}"
  exit 0
fi

# --- MODE releases ---------------------------------------------------------------------
if [ "$MODE" = "releases" ]; then
  CUR="null"; PREV="null"
  if [ -f "$STATE_FILE" ]; then
    CUR="$("$HS_NODE_BIN" -e "const s=JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));console.log(JSON.stringify(s.current))" 2>/dev/null || echo null)"
    PREV="$("$HS_NODE_BIN" -e "const s=JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));console.log(JSON.stringify(s.previous))" 2>/dev/null || echo null)"
  fi
  DIRS=""
  if [ -d "$RELEASES_DIR" ]; then
    DIRS="$(ls -1 "$RELEASES_DIR" 2>/dev/null | grep -v 'installed.json' | sort -rV || true)"
  fi
  REL_JSON="$("$HS_NODE_BIN" -e "console.log(JSON.stringify(process.argv.slice(1).filter(Boolean)))" $DIRS 2>/dev/null || echo '[]')"
  echo "{\"releases\": $REL_JSON, \"current\": $CUR, \"previous\": $PREV}"
  exit 0
fi

# --- MODE rollback ---------------------------------------------------------------------
if [ "$MODE" = "rollback" ]; then
  PREV="$(read_state | "$HS_NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log(s.previous ?? '')}")"
  [ -n "$PREV" ] || fail "Aucune release précédente à restaurer."
  [ -d "$RELEASES_DIR/$PREV" ] || fail "La release $PREV est introuvable sur le disque."
  logv "Bascule current -> $PREV"
  ln -sfn "$RELEASES_DIR/$PREV" "$CURRENT_LINK"
  systemctl restart hs-helper
  systemctl restart homeserver
  sleep 3
  if systemctl is-active --quiet homeserver; then
    read_state | "$HS_NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);const c=s.current;const p=s.previous;s.current=p;s.previous=c;const h=(s.history||[]);h.push({version:p,at:new Date().toISOString(),status:'rollback'});console.log(JSON.stringify({...s,history:h}))}" > "$STATE_FILE.tmp"
    mv "$STATE_FILE.tmp" "$STATE_FILE"
    chown "$HS_USER:$HS_USER" "$STATE_FILE"
    echo "{\"rolledBack\": true, \"current\": \"$PREV\", \"active\": true}"
  else
    echo "{\"rolledBack\": true, \"current\": \"$PREV\", \"active\": false}" >&2
    exit 1
  fi
  exit 0
fi

# --- MODE apply ------------------------------------------------------------------------
BEFORE_STATE="$(read_state)"
BEFORE="$(printf '%s' "$BEFORE_STATE" | "$HS_NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log(s.current ?? 'none')})")"

git -C "$SRC_DIR" fetch origin "$BRANCH" --tags >/dev/null 2>&1 || fail "git fetch impossible (réseau ?)"
LOCAL="$(git -C "$SRC_DIR" rev-parse HEAD)"
REMOTE="$(git -C "$SRC_DIR" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")"
[ -n "$REMOTE" ] || fail "origin/$BRANCH introuvable."

if [ "$LOCAL" = "$REMOTE" ] && [ "$BEFORE" != "none" ]; then
  echo "{\"updated\": false, \"current\": \"$BEFORE\", \"branch\": \"$BRANCH\"}"
  exit 0
fi

git -C "$SRC_DIR" reset --hard "origin/$BRANCH" >/dev/null 2>&1 || fail "git reset impossible (modifications locales ?)"
NEW_VERSION="$(node -e "console.log(require('$SRC_DIR/package.json').version)" 2>/dev/null || echo unknown)"

RELEASE_DIR="$RELEASES_DIR/$NEW_VERSION"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
chown -R "$HS_USER:$HS_USER" "$RELEASE_DIR"

logv "Sync des sources vers la release $NEW_VERSION"
tar -C "$SRC_DIR" \
  --exclude='./node_modules' \
  --exclude='./server/dist' \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./front/dist' \
  --exclude='./front/node_modules' \
  -cf - . | tar -C "$RELEASE_DIR" -xf -
chown -R "$HS_USER:$HS_USER" "$RELEASE_DIR"

run_step() {
  local msg="$1"; shift
  logv "$msg"
  "$@" >/dev/null 2>&1 || fail "Échec: $msg"
}

logv "Dépendances + build back"
run_step "npm ci" ash "cd '$RELEASE_DIR' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "build back" ash "cd '$RELEASE_DIR' && '$HS_NPM_BIN' run build"
run_step "npm ci front" ash "cd '$RELEASE_DIR/front' && '$HS_NPM_BIN' ci --no-audit --no-fund"
run_step "build front" ash "cd '$RELEASE_DIR/front' && '$HS_NPM_BIN' run build"

[ -f "$RELEASE_DIR/server/dist/server/src/index.js" ] || fail "Build back incomplet."
[ -f "$RELEASE_DIR/front/dist/index.html" ] || fail "Build front incomplet."

# Préparer .env de la release (copie de l'existant)
[ -f "$INSTALL_DIR/.env" ] && cp "$INSTALL_DIR/.env" "$RELEASE_DIR/.env" && chown "$HS_USER:$HS_USER" "$RELEASE_DIR/.env"

# Bascule atomique
logv "Bascule current -> $NEW_VERSION"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
systemctl restart hs-helper
systemctl restart homeserver

# Health-check avec rollback automatique
sleep 5
HEALTHY=false
for i in 1 2 3 4 5 6; do
  if systemctl is-active --quiet homeserver && curl -fsS "http://127.0.0.1:$PANEL_PORT/api/health" >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 5
done

if $HEALTHY; then
  "$HS_NODE_BIN" - "$BEFORE_STATE" "$NEW_VERSION" <<'NODEEOF' > "$STATE_FILE.tmp"
let d = '';
process.stdin.on('end', () => {});
const [, , beforeState, newVersion] = process.argv;
const state = JSON.parse(beforeState || '{"current":null,"previous":null,"history":[]}');
const history = state.history ?? [];
if (state.current && state.current !== newVersion) history.push({ version: state.current, at: new Date().toISOString(), status: 'replaced' });
state.previous = state.current;
state.current = newVersion;
state.updatedAt = new Date().toISOString();
state.history = history.slice(-20);
console.log(JSON.stringify(state, null, 0));
NODEEOF
  mv "$STATE_FILE.tmp" "$STATE_FILE"
  chown "$HS_USER:$HS_USER" "$STATE_FILE"

  # Ménage : garder les KEEP_RELEASES dernières releases
  ls -1d "$RELEASES_DIR"/*/ 2>/dev/null | sort -rV | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf

  echo "{\"updated\": true, \"current\": \"$BEFORE\", \"latest\": \"$NEW_VERSION\", \"branch\": \"$BRANCH\", \"active\": true}"
else
  # Rollback automatique
  logv "Health-check échoué — rollback"
  if [ "$BEFORE" != "none" ] && [ -d "$RELEASES_DIR/$BEFORE" ]; then
    ln -sfn "$RELEASES_DIR/$BEFORE" "$CURRENT_LINK"
    systemctl restart hs-helper
    systemctl restart homeserver
  fi
  echo "{\"updated\": false, \"rolledBack\": true, \"failedVersion\": \"$NEW_VERSION\", \"current\": \"$BEFORE\", \"active\": $(systemctl is-active --quiet homeserver && echo true || echo false)}" >&2
  exit 1
fi
