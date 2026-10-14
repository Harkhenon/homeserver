#!/usr/bin/env bash
# common/pair.sh — fonction de réparation mutuelle du couple core+updater.
# SOURCE UNIQUE : injectée mécaniquement dans updater-core.sh et updater.sh au build
# (make-release.sh). Ne jamais éditer les copies générées.

PAIR_DIR="${PAIR_DIR:-/usr/local/lib/homeserver/updater}"
PAIR_STATE_DIR="${PAIR_STATE_DIR:-/var/lib/homeserver}"
UPDATER_REPO_API="${UPDATER_REPO_API:-https://api.github.com/repos/Harkhenon/homeserver-updater/releases/latest}"
UPDATER_FALLBACK_TARBALL="${UPDATER_FALLBACK_TARBALL:-}"

# Health-check mutuel : chaque moitié vérifie l'autre (présence, exécutable).
# Sortie : "ok" ou description du problème sur stdout.
pair_health() {
  local self="$1" other="$2"
  if [ ! -f "$PAIR_DIR/$other" ]; then
    echo "missing:$other"
    return 1
  fi
  if [ ! -x "$PAIR_DIR/$other" ]; then
    echo "not-executable:$other"
    return 1
  fi
  echo "ok"
}

# Réparation : re-télécharge le couple depuis la dernière release de l'updater,
# vérifie le SHA256, bascule atomiquement avec conservation de pair.prev/.
# Utilisable par le core (pour réparer l'updater) ET par l'updater (pour réparer le core) :
# la même fonction, deux points d'entrée.
pair_repair() {
  local tmp
  tmp="$(mktemp -d)"
  # 1. Trouver le tarball de la dernière release (asset officiel, fallback archive du tag)
  local tar_url=""
  if command -v curl >/dev/null 2>&1; then
    tar_url="$(curl -fsSL "$UPDATER_REPO_API" 2>/dev/null \
      | grep -o '"browser_download_url": *"[^"]*homeserver-updater-[^"]*\.tar\.gz"' \
      | head -1 | grep -o 'https[^"]*') || true"
  fi
  if [ -z "$tar_url" ] && [ -n "$UPDATER_FALLBACK_TARBALL" ]; then
    tar_url="$UPDATER_FALLBACK_TARBALL"
  fi
  [ -n "$tar_url" ] || { echo "repair: aucune source de téléchargement"; return 1; }
  # 2. Télécharger + extraire
  curl -fsSL "$tar_url" -o "$tmp/pair.tar.gz" || { echo "repair: téléchargement impossible"; return 1; }
  tar -xzf "$tmp/pair.tar.gz" -C "$tmp" || { echo "repair: archive illisible"; return 1; }
  local src_dir
  src_dir="$(find "$tmp" -maxdepth 2 -name VERSION -printf '%h\n' | head -1)"
  [ -n "$src_dir" ] || { echo "repair: VERSION introuvable dans l'archive"; return 1; }
  # 3. Vérifier SHA256SUMS si présent
  if [ -f "$src_dir/SHA256SUMS" ]; then
    (cd "$src_dir" && sha256sum -c SHA256SUMS >/dev/null 2>&1) || { echo "repair: checksum invalide"; return 1; }
  fi
  # 4. Bascule atomique du couple, avec pair.prev/
  if [ -d "$PAIR_DIR" ]; then
    rm -rf "$PAIR_DIR/../pair.prev"
    cp -a "$PAIR_DIR" "$PAIR_DIR/../pair.prev"
  fi
  mkdir -p "$PAIR_DIR"
  cp "$src_dir/updater-core.sh" "$src_dir/updater.sh" "$src_dir/VERSION" "$PAIR_DIR/"
  chmod +x "$PAIR_DIR/updater-core.sh" "$PAIR_DIR/updater.sh"
  # 5. Ménage
  rm -rf "$tmp"
  echo "repair: couple réinstallé ($(cat "$src_dir/VERSION" 2>/dev/null || echo '?'))"
}

# Version du couple actuellement installé sur le disque.
pair_local_version() {
  # VERSION est un JSON {"version": "x.y.z", "panelMin": "..."} — extraire le semver.
  local raw
  raw="$(cat "$PAIR_DIR/VERSION" 2>/dev/null || true)"
  if [ -z "$raw" ]; then echo "unknown"; return 0; fi
  printf '%s' "$raw" | grep -o '"version": *"[^"]*"' | head -1 | grep -o '[0-9][^"]*' || echo "unknown"
}
