#!/usr/bin/env bash
# tools/signing-key.sh — génère (ou fait tourner) la clé Ed25519 de signature des releases.
# Usage : bash tools/signing-key.sh <fichier-clé-privée>
#
# - crée la clé privée (si absente), à garder HORS du dépôt ;
# - écrit la clé publique dans keys/release-signing.pub.pem et dans updater/common/pair.sh ;
# - affiche la suite : secret HS_RELEASE_SIGNING_KEY à poser sur les dépôts homeserver et
#   homeserver-updater (Settings → Secrets → Actions), contenu = la clé privée PEM.
# Après une rotation, publier d'abord un couple updater signé avec l'ANCIENNE clé et
# embarquant la nouvelle clé publique, puis signer les releases suivantes avec la nouvelle.
set -euo pipefail

KEY="${1:?chemin de la clé privée requis (ex: ~/.homeserver/release-signing.key)}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$KEY" ]; then
  mkdir -p "$(dirname "$KEY")"
  (umask 077; openssl genpkey -algorithm ed25519 -out "$KEY")
  echo "→ clé privée créée : $KEY"
fi
openssl pkey -in "$KEY" -pubout > "$DIR/keys/release-signing.pub.pem"
PUB_B64="$(sed -n '2p' "$DIR/keys/release-signing.pub.pem")"
sed -i "/^HS_RELEASE_PUBKEY='-----BEGIN PUBLIC KEY-----$/{n;s|^.*$|$PUB_B64|}" "$DIR/updater/common/pair.sh"
grep -qF "$PUB_B64" "$DIR/updater/common/pair.sh" || { echo "✗ mise à jour de updater/common/pair.sh impossible" >&2; exit 1; }
echo "→ clé publique : keys/release-signing.pub.pem et updater/common/pair.sh"
echo "  secret GitHub HS_RELEASE_SIGNING_KEY (dépôts homeserver et homeserver-updater) = contenu de $KEY"
