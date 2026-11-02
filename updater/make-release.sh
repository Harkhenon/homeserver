#!/usr/bin/env bash
# make-release.sh — construit la release du couple updater.
# Assemble (injection de common/pair.sh dans les deux fichiers), hashe, tarballe, signe.
# Usage: bash updater/make-release.sh <version> [panelMin]
# Signature Ed25519 de l'archive (<archive>.sig, exigée par pair_repair et install.sh) si
# HS_RELEASE_SIGNING_KEY (PEM) ou HS_RELEASE_SIGNING_KEY_FILE est fourni ;
# HS_REQUIRE_SIGNATURE=1 (CI) fait échouer le build sans clé.
set -euo pipefail

VERSION="${1:?version requise (ex: 1.1.0)}"
PANEL_MIN="${2:-0.8.0}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/dist"
STAGE="$OUT/homeserver-updater-$VERSION"
ARCHIVE="$OUT/homeserver-updater-$VERSION.tar.gz"

rm -rf "$STAGE"
mkdir -p "$STAGE"

for f in updater-core.sh updater.sh; do
  # Injection de pair.sh entre les marqueurs
  awk -v pair="$DIR/common/pair.sh" '
    /^___PAIR_SH___$/ && !done {
      while ((getline line < pair) > 0) print line;
      done = 1; next;
    }
    { print }
  ' "$DIR/$f" > "$STAGE/$f"
  chmod +x "$STAGE/$f"
done

printf '{"version": "%s", "panelMin": "%s"}\n' "$VERSION" "$PANEL_MIN" > "$STAGE/VERSION"

(cd "$STAGE" && sha256sum updater-core.sh updater.sh VERSION > SHA256SUMS)

tar -czf "$ARCHIVE" -C "$OUT" "homeserver-updater-$VERSION"
(cd "$OUT" && sha256sum "${ARCHIVE##*/}" > "${ARCHIVE##*/}.sha256")

KEY_FILE="${HS_RELEASE_SIGNING_KEY_FILE:-}"
if [ -z "$KEY_FILE" ] && [ -n "${HS_RELEASE_SIGNING_KEY:-}" ]; then
  KEY_FILE="$(mktemp)"
  trap 'rm -f "$KEY_FILE"' EXIT
  printf '%s\n' "$HS_RELEASE_SIGNING_KEY" > "$KEY_FILE"
fi
if [ -n "$KEY_FILE" ]; then
  openssl pkeyutl -sign -inkey "$KEY_FILE" -rawin -in "$ARCHIVE" -out "$ARCHIVE.sig"
  echo "  signature : ${ARCHIVE##*/}.sig"
elif [ "${HS_REQUIRE_SIGNATURE:-0}" = 1 ]; then
  echo "✗ clé de signature absente (HS_RELEASE_SIGNING_KEY) — release refusée" >&2
  exit 1
fi

rm -rf "$STAGE"
echo "→ $ARCHIVE (couple $VERSION, panelMin $PANEL_MIN)"
echo "  attacher le tarball, le .sha256 et le .sig à la GitHub Release v$VERSION du dépôt homeserver-updater"
