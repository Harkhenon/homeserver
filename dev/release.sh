#!/usr/bin/env bash
# dev/release.sh — automatise la mise à jour (release) du panel ou de l'updater.
# Usage :
#   bash dev/release.sh panel <version>              # ex: bash dev/release.sh panel 0.7.0
#   bash dev/release.sh updater <version> [panelMin] # ex: bash dev/release.sh updater 1.0.6 0.6.0
#
# panel  : bumpe package.json, commit, tag vX.Y.Z, push (la CI construit et publie la release).
# updater: tag vX.Y.Z sur le dépôt homeserver-updater, push (la CI assemble le couple et publie).
#          panelMin (optionnel) met à jour la version minimale du panel requise par le couple.
#
# Ce script n'existe que sur la branche dev et n'est jamais embarqué dans les releases
# (le tarball du panel est construit via `git archive` du tag, dev/ est exclu si absent du tag).

set -euo pipefail

VERSION_RE='^[0-9]+\.[0-9]+(\.[0-9]+)?$'

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

die() { echo "✗ $*" >&2; exit 1; }
info() { echo "→ $*"; }

[ $# -ge 2 ] || usage
TARGET="$1"
VERSION="$2"
PANEL_MIN="${3:-}"

echo "$VERSION" | grep -Eq "$VERSION_RE" || die "version invalide: $VERSION (format attendu: X.Y.Z)"
case "${VERSION#v}" in "$VERSION") ;; *) die "ne préfixe pas la version avec 'v', le script s'en charge";; esac

PANEL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPDATER_DIR="${HS_UPDATER_DIR:-$PANEL_DIR/../homeserver-updater}"

require_clean() {
  [ -z "$(git -C "$1" status --porcelain)" ] || die "arbre de travail non propre dans $1 — committe ou stashe d'abord"
}

require_gh() {
  command -v gh >/dev/null 2>&1 || die "gh CLI requis (authentifié) : https://cli.github.com"
  gh auth status >/dev/null 2>&1 || die "gh non authentifié : lance 'gh auth login'"
}

wait_release() {
  local repo="$1" tag="$2"
  info "attente de la release $tag sur $repo (CI)…"
  if gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
    echo "✓ release publiée : $(gh release view "$tag" --repo "$repo" --json url -q .url)"
    return 0
  fi
  echo "  (encore en cours — vérifie : gh run watch --repo $repo ou gh release view $tag --repo $repo)"
}

release_panel() {
  cd "$PANEL_DIR"
  require_clean "$PANEL_DIR"
  require_gh
  local tag="v$VERSION"
  [ -z "$(git tag -l "$tag")" ] || die "le tag $tag existe déjà"

  local cur
  cur="$(node -p "require('./package.json').version")"
  info "panel : $cur → $VERSION"

  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  git add package.json
  git commit -m "Release $VERSION"
  git tag -a "$tag" -m "Release $VERSION"

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  info "push $branch + $tag"
  git push origin "$branch" "$tag"

  wait_release "Harkhenon/homeserver" "$tag"
}

release_updater() {
  [ -d "$UPDATER_DIR/.git" ] || die "dépôt updater introuvable: $UPDATER_DIR (ajuste HS_UPDATER_DIR)"
  cd "$UPDATER_DIR"
  require_clean "$UPDATER_DIR"
  require_gh
  local tag="v$VERSION"
  [ -z "$(git tag -l "$tag")" ] || die "le tag $tag existe déjà"

  if [ -n "$PANEL_MIN" ]; then
    echo "$PANEL_MIN" | grep -Eq "$VERSION_RE" || die "panelMin invalide: $PANEL_MIN"
    local wf=".github/workflows/release.yml"
    [ -f "$wf" ] || die "$wf introuvable"
    sed -i "s/make-release.sh \"\$VERSION\" \"[^\"]*\"/make-release.sh \"\$VERSION\" \"$PANEL_MIN\"/" "$wf"
    if [ -n "$(git status --porcelain)" ]; then
      git add "$wf"
      git commit -m "panelMin: $PANEL_MIN"
      info "panelMin mis à jour: $PANEL_MIN"
    fi
  fi

  git tag -a "$tag" -m "Couple updater $VERSION"
  info "push main + $tag"
  git push origin main "$tag"

  wait_release "Harkhenon/homeserver-updater" "$tag"
}

case "$TARGET" in
  panel)   release_panel ;;
  updater) release_updater ;;
  *)       usage ;;
esac
