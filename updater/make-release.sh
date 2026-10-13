#!/usr/bin/env bash
# make-release.sh — construit la release du couple updater.
# Assemble (injection de common/pair.sh dans les deux fichiers), hashe, tarballe.
# Usage: bash updater/make-release.sh <version> [panelMin]
set -euo pipefail

VERSION="${1:?version requise (ex: 1.0.0)}"
PANEL_MIN="${2:-0.5.0}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/dist"
STAGE="$OUT/homeserver-updater-$VERSION"

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

tar -czf "$OUT/homeserver-updater-$VERSION.tar.gz" -C "$OUT" "homeserver-updater-$VERSION"
(cd "$STAGE" && sha256sum "homeserver-updater-$VERSION.tar.gz" > /dev/null 2>&1 || true)
sha256sum "$OUT/homeserver-updater-$VERSION.tar.gz" | tee "$OUT/homeserver-updater-$VERSION.tar.gz.sha256"

rm -rf "$STAGE"
echo "→ $OUT/homeserver-updater-$VERSION.tar.gz (couple $VERSION, panelMin $PANEL_MIN)"
echo "  attacher le tarball + le .sha256 à la GitHub Release v$VERSION du dépôt homeserver-updater"
