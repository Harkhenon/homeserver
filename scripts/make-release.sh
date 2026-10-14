#!/usr/bin/env bash
# make-release.sh — construit le tarball de release du panel.
# Usage: bash scripts/make-release.sh <version>   (ex: 0.7.0)
# Attacher dist/homeserver-v<version>.tar.gz + .sha256 à la GitHub Release v<version>.
set -euo pipefail

VERSION="${1:?version requise (ex: 0.7.0)}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$DIR/dist"
ARCHIVE="homeserver-v${VERSION}.tar.gz"

rm -rf "$OUT"
mkdir -p "$OUT"

# Archive des sources depuis un git archive si dépôt git (contenu du tag = déterministe),
# sinon tar du répertoire avec exclusions.
if git -C "$DIR" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$DIR" archive --format=tar.gz --prefix="homeserver-${VERSION}/" -o "$OUT/$ARCHIVE" HEAD
else
  tar -C "$DIR" \
    --exclude='./.git' --exclude='./.env' \
    --exclude='./node_modules' --exclude='./front/node_modules' \
    --exclude='./server/dist' --exclude='./front/dist' \
    --exclude='./dist' \
    --transform "s|^\./|homeserver-${VERSION}/|" \
    -czf "$OUT/$ARCHIVE" ./
fi

sha256sum "$OUT/$ARCHIVE" > "$OUT/$ARCHIVE.sha256"
echo "→ $OUT/$ARCHIVE ($(du -h "$OUT/$ARCHIVE" | cut -f1))"
echo "  attacher le tarball + le .sha256 à la GitHub Release v${VERSION}"
