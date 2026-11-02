#!/usr/bin/env bash
# make-release.sh — construit le tarball de release du panel.
# Usage: bash scripts/make-release.sh <version>   (ex: 0.7.0)
# Attacher dist/homeserver-v<version>.tar.gz + .sha256 + .sig à la GitHub Release v<version>.
# Signature Ed25519 (exigée par l'updater) si HS_RELEASE_SIGNING_KEY (PEM) ou
# HS_RELEASE_SIGNING_KEY_FILE est fourni ; HS_REQUIRE_SIGNATURE=1 (CI) l'impose.
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

(cd "$OUT" && sha256sum "$ARCHIVE" > "$ARCHIVE.sha256")

KEY_FILE="${HS_RELEASE_SIGNING_KEY_FILE:-}"
if [ -z "$KEY_FILE" ] && [ -n "${HS_RELEASE_SIGNING_KEY:-}" ]; then
  KEY_FILE="$(mktemp)"
  trap 'rm -f "$KEY_FILE"' EXIT
  printf '%s\n' "$HS_RELEASE_SIGNING_KEY" > "$KEY_FILE"
fi
if [ -n "$KEY_FILE" ]; then
  openssl pkeyutl -sign -inkey "$KEY_FILE" -rawin -in "$OUT/$ARCHIVE" -out "$OUT/$ARCHIVE.sig"
  # Contrôle immédiat avec la clé publique embarquée (clé de CI désynchronisée = échec)
  openssl pkeyutl -verify -pubin -inkey "$DIR/keys/release-signing.pub.pem" -rawin -in "$OUT/$ARCHIVE" -sigfile "$OUT/$ARCHIVE.sig" >/dev/null \
    || { echo "✗ la clé de signature ne correspond pas à keys/release-signing.pub.pem" >&2; exit 1; }
elif [ "${HS_REQUIRE_SIGNATURE:-0}" = 1 ]; then
  echo "✗ clé de signature absente (HS_RELEASE_SIGNING_KEY) — release refusée" >&2
  exit 1
fi

echo "→ $OUT/$ARCHIVE ($(du -h "$OUT/$ARCHIVE" | cut -f1))"
echo "  attacher le tarball, le .sha256 et le .sig à la GitHub Release v${VERSION}"
