#!/usr/bin/env bash
# common/pair.sh — fonction de réparation mutuelle du couple core+updater.
# SOURCE UNIQUE : injectée mécaniquement dans updater-core.sh et updater.sh au build
# (make-release.sh). Ne jamais éditer les copies générées.

PAIR_DIR="${PAIR_DIR:-/usr/local/lib/homeserver/updater}"
UPDATER_REPO_API="${UPDATER_REPO_API:-https://api.github.com/repos/Harkhenon/homeserver-updater/releases/latest}"

# Clé publique Ed25519 des releases (panel et couple). Toute archive téléchargée doit
# porter une signature <archive>.sig valide pour cette clé, sinon elle est refusée.
# Rotation : tools/signing-key.sh (remplacer aussi keys/release-signing.pub.pem du panel).
HS_RELEASE_PUBKEY='-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA3PlGadzCYQGKBO2g0KdYOA+bBGKhH9KSHxeI+fkEXPo=
-----END PUBLIC KEY-----'

# Vérifie la signature Ed25519 (openssl >= 3) d'un fichier.
pair_verify() { # fichier signature
  local key rc=0
  key="$(mktemp)"
  printf '%s\n' "$HS_RELEASE_PUBKEY" > "$key"
  openssl pkeyutl -verify -pubin -inkey "$key" -rawin -in "$1" -sigfile "$2" >/dev/null 2>&1 || rc=1
  rm -f "$key"
  return "$rc"
}

pair_version_lt() { # a b -> vrai si a < b
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]
}

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

# Réparation / self-update : re-télécharge le couple depuis la dernière release de
# l'updater, exige une signature valide et une version >= celle installée (pas de
# retour vers une ancienne version signée), puis bascule atomiquement (pair.prev/ conservé).
# Utilisable par le core (pour réparer l'updater) ET par l'updater (pour réparer le core).
pair_repair() {
  local tmp json tag tar_url local_version src_dir new_version
  tmp="$(mktemp -d)"
  # 1. Dernière release : asset officiel + sa signature (pas de repli non signé)
  json="$(curl -fsSL --connect-timeout 15 "$UPDATER_REPO_API" 2>/dev/null || true)"
  tag="$(printf '%s' "$json" | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"v\{0,1\}\([^"]*\)"$/\1/')"
  tar_url="$(printf '%s' "$json" | grep -o '"browser_download_url": *"[^"]*homeserver-updater-[^"]*\.tar\.gz"' | head -1 | grep -oE 'https?://[^"]*' || true)"
  [ -n "$tar_url" ] && [ -n "$tag" ] || { echo "repair: release du couple introuvable"; rm -rf "$tmp"; return 1; }
  printf '%s' "$json" | grep -qF "\"$tar_url.sig\"" || { echo "repair: release $tag non signée — refusée"; rm -rf "$tmp"; return 1; }
  local_version="$(pair_local_version)"
  if [ "$local_version" != "unknown" ] && pair_version_lt "$tag" "$local_version"; then
    echo "repair: release $tag plus ancienne que le couple installé ($local_version) — refusée"; rm -rf "$tmp"; return 1
  fi
  # 2. Télécharger + vérifier la signature AVANT toute extraction
  curl -fsSL "$tar_url" -o "$tmp/pair.tar.gz" && curl -fsSL "$tar_url.sig" -o "$tmp/pair.tar.gz.sig" \
    || { echo "repair: téléchargement impossible"; rm -rf "$tmp"; return 1; }
  pair_verify "$tmp/pair.tar.gz" "$tmp/pair.tar.gz.sig" || { echo "repair: signature invalide — refusée"; rm -rf "$tmp"; return 1; }
  mkdir "$tmp/x"
  tar -xzf "$tmp/pair.tar.gz" -C "$tmp/x" --no-same-owner || { echo "repair: archive illisible"; rm -rf "$tmp"; return 1; }
  src_dir="$(find "$tmp/x" -maxdepth 2 -name VERSION -printf '%h\n' -quit 2>/dev/null)"
  [ -n "$src_dir" ] && [ -f "$src_dir/updater-core.sh" ] && [ -f "$src_dir/updater.sh" ] || { echo "repair: archive incomplète"; rm -rf "$tmp"; return 1; }
  # 3. La version embarquée doit être celle du tag (archive signée renommée = refus)
  new_version="$(grep -o '"version": *"[^"]*"' "$src_dir/VERSION" | head -1 | grep -o '[0-9][^"]*' || true)"
  [ "$new_version" = "$tag" ] || { echo "repair: version de l'archive ($new_version) ≠ tag ($tag)"; rm -rf "$tmp"; return 1; }
  if [ -f "$src_dir/SHA256SUMS" ]; then
    (cd "$src_dir" && sha256sum -c SHA256SUMS >/dev/null 2>&1) || { echo "repair: checksum invalide"; rm -rf "$tmp"; return 1; }
  fi
  # 4. Bascule atomique (renommage de répertoire : un script en cours d'exécution garde son inode)
  rm -rf "$PAIR_DIR.new"
  mkdir -p "$PAIR_DIR.new"
  cp "$src_dir/updater-core.sh" "$src_dir/updater.sh" "$src_dir/VERSION" "$PAIR_DIR.new/"
  chown -R root:root "$PAIR_DIR.new"
  chmod 755 "$PAIR_DIR.new" "$PAIR_DIR.new/updater-core.sh" "$PAIR_DIR.new/updater.sh"
  chmod 644 "$PAIR_DIR.new/VERSION"
  rm -rf "$(dirname "$PAIR_DIR")/pair.prev"
  if [ -d "$PAIR_DIR" ]; then mv "$PAIR_DIR" "$(dirname "$PAIR_DIR")/pair.prev"; fi
  mv "$PAIR_DIR.new" "$PAIR_DIR"
  rm -rf "$tmp"
  echo "repair: couple réinstallé ($new_version)"
}

# Version du couple actuellement installé sur le disque.
pair_local_version() {
  # VERSION est un JSON {"version": "x.y.z", "panelMin": "..."} — extraire le semver.
  local raw
  raw="$(cat "$PAIR_DIR/VERSION" 2>/dev/null || true)"
  if [ -z "$raw" ]; then echo "unknown"; return 0; fi
  printf '%s' "$raw" | grep -o '"version": *"[^"]*"' | head -1 | grep -o '[0-9][^"]*' || echo "unknown"
}
