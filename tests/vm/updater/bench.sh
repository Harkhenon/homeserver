#!/usr/bin/env bash
# Banc de test des mises à jour Homeserver (VM jetable uniquement, en root).
# Clé de signature DE TEST générée dans la VM, fausse API GitHub locale sur :8099.
#   bench.sh init <archive-sources.tar.gz>   copie de test du dépôt + clé de test + serveur mock
#   bench.sh panel <version> [broken|unsigned|badsig]   construit et « publie » une release panel
#   bench.sh pair <version>                  construit et « publie » un couple updater
#   bench.sh point                           branche les unités de l'updater sur le mock
#   bench.sh login                           token admin (API du panel)
#   bench.sh api <action> [json]             appel POST /api/system/<action>
set -euo pipefail
B=/root/bench; SRC=$B/src; MOCK=$B/mock; KEY=$B/test-signing.key; PORT=8099
API=http://127.0.0.1:$PORT
pub_latest() { # repo version asset-dir-url... (assets = fichiers du répertoire)
  local repo="$1" ver="$2" dir="$3" assets="" f
  for f in "$MOCK/dl/$dir"/*; do assets="$assets{\"browser_download_url\": \"$API/dl/$dir/$(basename "$f")\"},"; done
  mkdir -p "$MOCK/repos/Harkhenon/$repo/releases"
  printf '{"tag_name": "v%s", "body": "Release de test %s", "assets": [%s]}\n' "$ver" "$ver" "${assets%,}" \
    > "$MOCK/repos/Harkhenon/$repo/releases/latest"
  echo "publié : $repo v$ver ($(ls "$MOCK/dl/$dir" | tr '\n' ' '))"
}
case "$1" in
  init)
    rm -rf "$B"; mkdir -p "$SRC" "$MOCK/dl"
    tar -xzf "$2" -C "$SRC" --strip-components=1
    find "$SRC" -type f \( -name '*.sh' -o -name '*.mjs' \) -exec sed -i 's/\r$//' {} +
    (umask 077; openssl genpkey -algorithm ed25519 -out "$KEY")
    bash "$SRC/tools/signing-key.sh" "$KEY" >/dev/null
    grep -q "$(sed -n 2p "$SRC/keys/release-signing.pub.pem")" "$SRC/updater/common/pair.sh"
    echo "clé de test installée dans la copie : $(sed -n 2p "$SRC/keys/release-signing.pub.pem")"
    systemctl stop hs-mock 2>/dev/null || true
    systemd-run --unit hs-mock --property=WorkingDirectory="$MOCK" python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null
    sleep 1; curl -fsS -o /dev/null "$API/" && echo "mock API : $API" ;;
  sync) # nouveau code source, même clé de test
    rm -rf "$SRC"; mkdir -p "$SRC"; tar -xzf "$2" -C "$SRC" --strip-components=1
    find "$SRC" -type f \( -name '*.sh' -o -name '*.mjs' \) -exec sed -i 's/\r$//' {} +
    bash "$SRC/tools/signing-key.sh" "$KEY" >/dev/null; echo "sources synchronisées (clé de test conservée)" ;;
  panel)
    ver="$2"; mode="${3:-}"; w=$B/work-$ver; rm -rf "$w"; cp -a "$SRC" "$w"
    sed -i "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$ver\"/" "$w/package.json"
    echo "$ver" > "$w/BENCH_MARKER"
    [ "$mode" = broken ] && sed -i '1i process.exit(1); // BENCH: release cassée volontairement' "$w/server/src/index.ts"
    if [ "$mode" = unsigned ]; then (cd "$w" && bash scripts/make-release.sh "$ver" >/dev/null)
    else (cd "$w" && HS_RELEASE_SIGNING_KEY_FILE="$KEY" bash scripts/make-release.sh "$ver" >/dev/null); fi
    if [ "$mode" = unsigned ]; then rm -f "$w/dist/"*.sig; fi
    if [ "$mode" = badsig ]; then printf 'x' >> "$w/dist/homeserver-v$ver.tar.gz"; fi   # archive altérée après signature
    rm -rf "$MOCK/dl/panel-$ver"; mkdir -p "$MOCK/dl/panel-$ver"; cp "$w/dist/"* "$MOCK/dl/panel-$ver/"
    pub_latest homeserver "$ver" "panel-$ver" ;;
  pair)
    ver="$2"; w=$B/pair-$ver; rm -rf "$w"; cp -a "$SRC/updater" "$w"
    (cd "$w" && HS_RELEASE_SIGNING_KEY_FILE="$KEY" bash make-release.sh "$ver" 0.8.0 >/dev/null)
    rm -rf "$MOCK/dl/pair-$ver"; mkdir -p "$MOCK/dl/pair-$ver"; cp "$w/dist/homeserver-updater-$ver.tar.gz"* "$MOCK/dl/pair-$ver/"
    pub_latest homeserver-updater "$ver" "pair-$ver" ;;
  point)
    for u in hs-updater-check hs-updater-apply; do
      mkdir -p /etc/systemd/system/$u.service.d
      printf '[Service]\nEnvironment=PANEL_REPO_API=%s/repos/Harkhenon/homeserver/releases/latest\nEnvironment=UPDATER_REPO_API=%s/repos/Harkhenon/homeserver-updater/releases/latest\n' "$API" "$API" \
        > /etc/systemd/system/$u.service.d/bench.conf
    done
    systemctl daemon-reload; echo "updater branché sur le mock" ;;
  login)
    P="$(cat $B/admin-password 2>/dev/null || grep -m1 '^HS_ADMIN_PASSWORD=' /usr/share/homeserver/.env | cut -d= -f2)"
    curl -fsS -X POST http://127.0.0.1:3000/api/auth/login -H 'content-type: application/json' \
      -d "{\"username\":\"admin\",\"password\":\"$P\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])' ;;
  api)
    T="$(bash "$0" login)"
    curl -sS -X POST "http://127.0.0.1:3000/api/system/$2" -H "authorization: Bearer $T" -H 'content-type: application/json' -d "${3:-{\}}" ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
