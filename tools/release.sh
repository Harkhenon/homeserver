#!/usr/bin/env bash
# tools/release.sh — release complète du panel (et du couple updater si besoin) en une commande,
# à lancer depuis `main` après une modification manuelle.
#
# Usage :
#   bash tools/release.sh [patch|minor|major|X.Y.Z] [options]     (défaut : patch)
#
# Options :
#   -m, --message "…"     commite les modifications en cours avec ce message (sinon demandé)
#   --updater auto|X.Y.Z|skip
#                         auto (défaut) : publie aussi le couple updater si updater/ a changé
#                         depuis la dernière release du panel (version = patch suivant)
#   --panel-min X.Y.Z     version minimale du panel exigée par le nouveau couple
#   --dry-run             vérifie tout et construit l'archive, sans rien commiter ni publier
#   -y, --yes             pas de confirmation avant publication
#   -h, --help
#
# Étapes : pré-requis (gh, node, openssl, main à jour) → contrôles (typecheck, build du front,
# syntaxe des scripts, cohérence de la clé publique) → commit des modifications → bump des
# versions (back + front + lockfiles) → archive de test → [couple updater : synchronisation
# vers homeserver-updater, tag, CI, vérification de la signature] → push de main + tag →
# attente de la CI de release → vérification des assets publiés (signature, checksum, version).
# Toute erreur avant publication annule les commits locaux (les modifications restent indexées).
#
# Compatibilité : `tools/release.sh panel X.Y.Z` et `tools/release.sh updater X.Y.Z [panelMin]`.
set -Eeuo pipefail

PANEL_REPO="${HS_PANEL_REPO:-Harkhenon/homeserver}"
# Branche de release (main). Autre valeur : uniquement pour tester l'outil en --dry-run.
BRANCH="${HS_RELEASE_BRANCH:-main}"
UPDATER_REPO="${HS_UPDATER_REPO:-Harkhenon/homeserver-updater}"
VERSION_RE='^[0-9]+\.[0-9]+\.[0-9]+$'

if [ -t 1 ]; then B='\033[1m'; G='\033[32m'; Y='\033[33m'; R='\033[31m'; D='\033[2m'; N='\033[0m'; else B=''; G=''; Y=''; R=''; D=''; N=''; fi
step() { echo -e "\n${B}▶ $*${N}"; }
ok()   { echo -e "${G}✓${N} $*"; }
info() { echo -e "${D}  $*${N}"; }
warn() { echo -e "${Y}! $*${N}"; }
die()  { echo -e "${R}✗ $*${N}" >&2; exit 1; }
usage() { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

# Chemin compréhensible par les outils Windows natifs (gh, git) sous Git Bash
nat() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# --- Arguments ------------------------------------------------------------------------
BUMP='patch'; MESSAGE=''; UPDATER_MODE=auto; PANEL_MIN=''; DRY_RUN=false; ASSUME_YES=false; ONLY_UPDATER=false
case "${1:-}" in
  panel) shift ;;
  updater) ONLY_UPDATER=true; shift; UPDATER_MODE="${1:?version du couple requise}"; shift; PANEL_MIN="${1:-}"; [ $# -gt 0 ] && shift ;;
esac
while [ $# -gt 0 ]; do
  case "$1" in
    patch|minor|major) BUMP="$1" ;;
    [0-9]*.[0-9]*.[0-9]*) BUMP="$1" ;;
    -m|--message) MESSAGE="${2:?message requis}"; shift ;;
    --updater) UPDATER_MODE="${2:?auto|X.Y.Z|skip}"; shift ;;
    --panel-min) PANEL_MIN="${2:?version requise}"; shift ;;
    --dry-run) DRY_RUN=true ;;
    -y|--yes) ASSUME_YES=true ;;
    -h|--help) usage 0 ;;
    *) echo "option inconnue : $1" >&2; usage 1 ;;
  esac
  shift
done
[ -z "$PANEL_MIN" ] || [[ "$PANEL_MIN" =~ $VERSION_RE ]] || die "--panel-min invalide : $PANEL_MIN"
[ "$BRANCH" = main ] || $DRY_RUN || die "HS_RELEASE_BRANCH=$BRANCH : publication uniquement depuis main (autorisé seulement avec --dry-run)"
case "$UPDATER_MODE" in auto|skip) ;; *) [[ "$UPDATER_MODE" =~ $VERSION_RE ]] || die "--updater attend auto, skip ou X.Y.Z" ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
WORK="$(mktemp -d)"
START_HEAD=''; PUBLISHED=false; LOCAL_TAG=''; UPD_PUBLISHED=false
cleanup() {
  local rc=$?
  rm -rf "$WORK"
  if [ "$rc" -ne 0 ] && $UPD_PUBLISHED && ! $PUBLISHED; then
    warn "le couple updater v$NEW_UPD est publié mais pas le panel : relance avec --updater skip"
  fi
  if [ "$rc" -ne 0 ] && ! $PUBLISHED && [ -n "$START_HEAD" ] && [ "$(git rev-parse HEAD)" != "$START_HEAD" ]; then
    git reset -q --soft "$START_HEAD" && warn "commits locaux annulés (modifications conservées dans l'index) : rien n'a été publié pour le panel"
  fi
  if [ "$rc" -ne 0 ] && ! $PUBLISHED && [ -n "$LOCAL_TAG" ]; then git tag -d "$LOCAL_TAG" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

confirm() { # question
  $ASSUME_YES && return 0
  [ -t 0 ] || die "confirmation requise (relance avec --yes en non interactif)"
  local a; read -r -p "$1 [o/N] " a
  case "$a" in o|O|oui|y|Y|yes) return 0 ;; *) return 1 ;; esac
}

# Attend le workflow de release déclenché par un tag, échoue s'il échoue.
wait_release_run() { # repo tag
  local repo="$1" tag="$2" id='' _
  for _ in $(seq 1 30); do
    id="$(gh run list --repo "$repo" --workflow release.yml --branch "$tag" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
    [ -n "$id" ] && break
    sleep 4
  done
  [ -n "$id" ] || die "workflow de release introuvable pour $repo $tag"
  info "CI : https://github.com/$repo/actions/runs/$id"
  gh run watch "$id" --repo "$repo" --exit-status >/dev/null 2>&1 \
    || die "le workflow de release de $repo $tag a échoué : gh run view $id --repo $repo --log-failed"
}

# Télécharge les assets d'une release et vérifie signature + checksum (+ version embarquée).
verify_assets() { # repo tag archive version-attendue fichier-de-version-dans-l'archive
  local repo="$1" tag="$2" archive="$3" ver="$4" member="$5" a content
  local d="$WORK/verif-$tag-${repo##*/}"
  mkdir -p "$d"
  gh release download "$tag" --repo "$repo" --dir "$(nat "$d")" >/dev/null || die "téléchargement des assets de $repo $tag impossible"
  for a in "$archive" "$archive.sha256" "$archive.sig"; do [ -f "$d/$a" ] || die "asset manquant sur $repo $tag : $a"; done
  openssl pkeyutl -verify -pubin -inkey keys/release-signing.pub.pem -rawin -in "$d/$archive" -sigfile "$d/$archive.sig" >/dev/null 2>&1 \
    || die "signature invalide pour $repo $tag ($archive)"
  (cd "$d" && sha256sum -c --status "$archive.sha256") || die "checksum invalide pour $repo $tag"
  # Lecture complète avant grep (avec pipefail, un tar coupé par grep -q ferait échouer le test)
  content="$(tar -xzOf "$d/$archive" "$member" 2>/dev/null || true)"
  grep -q "\"version\": *\"$ver\"" <<<"$content" || die "l'archive $archive n'embarque pas la version $ver ($member)"
  ok "$repo $tag : assets présents, signature Ed25519 et checksum valides, version $ver"
}

# --- 1. Pré-requis ------------------------------------------------------------------
step "Pré-requis"
for c in git gh node npm openssl sha256sum tar; do command -v "$c" >/dev/null 2>&1 || die "commande requise introuvable : $c"; done
gh auth status >/dev/null 2>&1 || die "gh non authentifié : gh auth login"
# Vérifiée ici pour qu'un --dry-run la détecte aussi : l'échec arriverait sinon en pleine publication
git var GIT_COMMITTER_IDENT >/dev/null 2>&1 || die "identité Git manquante : git config user.name \"…\" et git config user.email \"…\""
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || die "à lancer depuis la branche $BRANCH (actuelle : $(git rev-parse --abbrev-ref HEAD))"
git fetch -q origin main --tags || die "git fetch impossible"
git merge-base --is-ancestor origin/main HEAD || die "la branche n'inclut pas origin/main : git pull --ff-only d'abord"
[ -z "$(git rev-list origin/main..HEAD)" ] || warn "commits locaux non poussés : ils feront partie de la release ($(git rev-list --count origin/main..HEAD))"
START_HEAD="$(git rev-parse HEAD)"
PUB_PEM="$(sed -n 2p keys/release-signing.pub.pem)"
grep -qF "$PUB_PEM" updater/common/pair.sh || die "keys/release-signing.pub.pem et updater/common/pair.sh n'ont pas la même clé publique"
ok "outils, authentification GitHub, main à jour, clé publique cohérente"

CUR_VERSION="$(node -p "require('./package.json').version")"
PREV_TAG="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
case "$BUMP" in
  patch|minor|major) NEW_VERSION="$(node -e "
    const [a,b,c] = '$CUR_VERSION'.split(/[.-]/).map(Number);
    console.log({ major: [a+1,0,0], minor: [a,b+1,0], patch: [a,b,c+1] }['$BUMP'].join('.'))")" ;;
  *) NEW_VERSION="$BUMP" ;;
esac

# Couple updater : publication si updater/ a changé depuis la dernière release du panel
UPD_CUR="$(tr -dc '0-9.' < updater/VERSION)"
UPDATER_LATEST="$(gh release view --repo "$UPDATER_REPO" --json tagName --jq .tagName 2>/dev/null | tr -d v || true)"
NEW_UPD=''
case "$UPDATER_MODE" in
  skip) ;;
  auto)
    if [ -n "$PREV_TAG" ] && ! git diff --quiet "$PREV_TAG" -- updater/ 2>/dev/null || ! git diff --quiet -- updater/; then
      base="$UPD_CUR"; [ -n "$UPDATER_LATEST" ] && [ "$(printf '%s\n%s\n' "$base" "$UPDATER_LATEST" | sort -V | tail -1)" = "$UPDATER_LATEST" ] && base="$UPDATER_LATEST"
      NEW_UPD="$(node -e "const [a,b,c]='$base'.split('.').map(Number);console.log([a,b,c+1].join('.'))")"
    fi ;;
  *) NEW_UPD="$UPDATER_MODE" ;;
esac

if $ONLY_UPDATER; then
  NEW_VERSION=''
else
  [[ "$NEW_VERSION" =~ $VERSION_RE ]] || die "version invalide : $NEW_VERSION"
  [ "$(printf '%s\n%s\n' "$CUR_VERSION" "$NEW_VERSION" | sort -V | tail -1)" = "$NEW_VERSION" ] && [ "$NEW_VERSION" != "$CUR_VERSION" ] \
    || die "la nouvelle version ($NEW_VERSION) doit être supérieure à la version actuelle ($CUR_VERSION)"
  git rev-parse -q --verify "refs/tags/v$NEW_VERSION" >/dev/null && die "le tag v$NEW_VERSION existe déjà"
fi
if [ -n "$NEW_UPD" ]; then
  [[ "$NEW_UPD" =~ $VERSION_RE ]] || die "version du couple invalide : $NEW_UPD"
  gh release view "v$NEW_UPD" --repo "$UPDATER_REPO" >/dev/null 2>&1 && die "le couple v$NEW_UPD existe déjà sur $UPDATER_REPO"
fi

# --- 2. Modifications en cours ----------------------------------------------------------
step "Modifications en cours"
CHANGES="$(git status --porcelain)"
if [ -n "$CHANGES" ]; then
  git status --short
  if [ -z "$MESSAGE" ] && ! $DRY_RUN; then
    $ASSUME_YES && die "modifications non commitées : précise le message avec -m \"…\""
    [ -t 0 ] || die "modifications non commitées : précise le message avec -m \"…\""
    read -r -p "Message de commit pour ces modifications (vide = abandon) : " MESSAGE
    [ -n "$MESSAGE" ] || die "abandon : aucune modification commitée"
  fi
else
  info "aucune modification non commitée"
fi

# --- 3. Contrôles (sur l'arbre de travail tel qu'il sera publié) ---------------------------
step "Contrôles"
bad=0
while IFS= read -r f; do bash -n "$f" 2>/dev/null || { warn "erreur de syntaxe : $f"; bad=1; }; done < <(git ls-files -co --exclude-standard '*.sh')
node --check scripts/install.mjs || bad=1
[ "$bad" -eq 0 ] || die "scripts invalides"
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -S error scripts/*.sh updater/*.sh updater/common/pair.sh tools/*.sh || die "shellcheck : erreurs bloquantes"
  ok "syntaxe des scripts + shellcheck"
else
  ok "syntaxe des scripts (shellcheck absent : ignoré)"
fi
[ -d node_modules ] || { info "npm ci (back)…"; npm ci --no-audit --no-fund --loglevel=error >/dev/null; }
npm run -s typecheck >/dev/null || die "typecheck du back en échec : npm run typecheck"
ok "typecheck du back et du helper"
[ -d front/node_modules ] || { info "npm ci (front)…"; (cd front && npm ci --no-audit --no-fund --loglevel=error >/dev/null); }
(cd front && npm run -s build >/dev/null 2>"$WORK/front.err") || { tail -20 "$WORK/front.err" >&2; die "build du front en échec"; }
ok "build du front (tsc + vite)"

# --- 4. Plan + confirmation ---------------------------------------------------------------
step "Plan"
$ONLY_UPDATER || echo -e "  panel   : ${B}$CUR_VERSION → $NEW_VERSION${N} (tag v$NEW_VERSION sur $PANEL_REPO, depuis ${PREV_TAG:-le début})"
if [ -n "$NEW_UPD" ]; then
  echo -e "  updater : ${B}${UPDATER_LATEST:-?} → $NEW_UPD${N} (synchronisé depuis updater/, tag v$NEW_UPD sur $UPDATER_REPO${PANEL_MIN:+, panelMin $PANEL_MIN})"
else
  echo "  updater : inchangé (${UPDATER_LATEST:-?})"
fi
[ -n "$CHANGES" ] && echo "  commit  : « ${MESSAGE:-<dry-run>} » ($(echo "$CHANGES" | wc -l | tr -d ' ') fichier(s))"
if [ -n "$PREV_TAG" ] && ! $ONLY_UPDATER; then
  echo "  contenu :"; git log --oneline --no-merges "$PREV_TAG..HEAD" | sed 's/^/    /'; [ -n "$CHANGES" ] && echo "    + ${MESSAGE:-modifications non commitées}"
fi

if $DRY_RUN; then
  if ! $ONLY_UPDATER; then
    git archive --format=tar.gz --prefix="homeserver-$NEW_VERSION/" -o "$WORK/test.tar.gz" HEAD
    grep -qx "homeserver-$NEW_VERSION/scripts/layout.sh" <<<"$(tar -tzf "$WORK/test.tar.gz")" || die "archive de test incomplète"
    ok "archive de test construite (HEAD, sans les modifications non commitées)"
  fi
  echo -e "\n${G}Dry-run terminé : tout est prêt, rien n'a été commité ni publié.${N}"
  exit 0
fi
confirm "Publier ?" || die "abandon : rien n'a été publié"

# --- 5. Commits locaux ------------------------------------------------------------------
step "Commits"
if [ -n "$CHANGES" ]; then
  git add -A
  git commit -q -m "$MESSAGE"
  ok "modifications commitées : $MESSAGE"
fi
if [ -n "$NEW_UPD" ]; then
  echo "$NEW_UPD" > updater/VERSION
  [ -z "$PANEL_MIN" ] || sed -i "s/^PANEL_MIN=\"\${2:-[^}]*}\"/PANEL_MIN=\"\${2:-$PANEL_MIN}\"/" updater/make-release.sh
fi
if ! $ONLY_UPDATER; then
  npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version >/dev/null
  (cd front && npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version >/dev/null)
fi
git add package.json package-lock.json front/package.json front/package-lock.json updater/VERSION updater/make-release.sh
if $ONLY_UPDATER; then
  git diff --cached --quiet || git commit -q -m "Couple updater $NEW_UPD"
else
  git commit -q -m "Release $NEW_VERSION${NEW_UPD:+ (couple updater $NEW_UPD)}"
fi
if ! $ONLY_UPDATER; then
  git archive --format=tar.gz --prefix="homeserver-$NEW_VERSION/" -o "$WORK/test.tar.gz" HEAD
  grep -q "\"version\": \"$NEW_VERSION\"" <<<"$(tar -xzOf "$WORK/test.tar.gz" "homeserver-$NEW_VERSION/package.json")" || die "archive de test : mauvaise version"
  ok "commit de release prêt, archive de test valide"
fi

# --- 6. Couple updater (AVANT le panel : une release du panel peut en dépendre) ----------
if [ -n "$NEW_UPD" ]; then
  step "Couple updater $NEW_UPD"
  UPD_DIR="$WORK/updater-repo"
  gh repo clone "$UPDATER_REPO" "$(nat "$UPD_DIR")" -- -q >/dev/null 2>&1 || die "clonage de $UPDATER_REPO impossible"
  # Clone neuf : il ne voit pas la configuration locale du dépôt courant. Une identité passée
  # par GIT_AUTHOR_* et GIT_COMMITTER_* lui parvient déjà par l'environnement.
  for key in user.name user.email; do
    value="$(git config "$key" || true)"
    [ -z "$value" ] || git -C "$UPD_DIR" config "$key" "$value"
  done
  for f in updater-core.sh updater.sh common/pair.sh make-release.sh; do
    git show "HEAD:updater/$f" > "$UPD_DIR/$f"
  done
  [ -z "$PANEL_MIN" ] || sed -i "s/make-release.sh \"\$VERSION\" \"[^\"]*\"/make-release.sh \"\$VERSION\" \"$PANEL_MIN\"/" "$UPD_DIR/.github/workflows/release.yml"
  grep -q 'HS_RELEASE_SIGNING_KEY' "$UPD_DIR/.github/workflows/release.yml" || die "le workflow de $UPDATER_REPO ne signe pas les archives"
  git -C "$UPD_DIR" add -A
  git -C "$UPD_DIR" diff --cached --quiet && info "sources du couple déjà à jour sur $UPDATER_REPO" \
    || git -C "$UPD_DIR" commit -q -m "Couple $NEW_UPD (synchronisé depuis $PANEL_REPO@$(git rev-parse --short HEAD))"
  git -C "$UPD_DIR" tag -a "v$NEW_UPD" -m "Couple updater $NEW_UPD"
  git -C "$UPD_DIR" push -q origin HEAD:main "v$NEW_UPD" || die "push vers $UPDATER_REPO refusé"
  ok "tag v$NEW_UPD poussé sur $UPDATER_REPO"
  wait_release_run "$UPDATER_REPO" "v$NEW_UPD"
  verify_assets "$UPDATER_REPO" "v$NEW_UPD" "homeserver-updater-$NEW_UPD.tar.gz" "$NEW_UPD" "homeserver-updater-$NEW_UPD/VERSION"
  UPD_PUBLISHED=true
fi

# --- 7. Panel -----------------------------------------------------------------------------
if $ONLY_UPDATER; then
  git push -q origin HEAD:main && PUBLISHED=true
  ok "main poussée (updater/VERSION = $NEW_UPD)"
else
  step "Panel $NEW_VERSION"
  git tag -a "v$NEW_VERSION" -m "Release $NEW_VERSION"; LOCAL_TAG="v$NEW_VERSION"
  git push -q origin HEAD:main || die "push de main refusé (protection de branche ?) : rien n'a été publié pour le panel"
  PUBLISHED=true
  git push -q origin "v$NEW_VERSION" || die "push du tag v$NEW_VERSION refusé — main est poussée : relance git push origin v$NEW_VERSION"
  ok "main + tag v$NEW_VERSION poussés"
  wait_release_run "$PANEL_REPO" "v$NEW_VERSION"
  verify_assets "$PANEL_REPO" "v$NEW_VERSION" "homeserver-v$NEW_VERSION.tar.gz" "$NEW_VERSION" "homeserver-$NEW_VERSION/package.json"
fi

# --- 8. Résumé --------------------------------------------------------------------------
echo
$ONLY_UPDATER || echo -e "${G}${B}Panel v$NEW_VERSION publié${N} : https://github.com/$PANEL_REPO/releases/tag/v$NEW_VERSION"
[ -z "$NEW_UPD" ] || echo -e "${G}${B}Couple updater v$NEW_UPD publié${N} : https://github.com/$UPDATER_REPO/releases/tag/v$NEW_UPD"
echo -e "${D}  Les serveurs la verront au prochain check (timer 6 h) ou tout de suite via"
echo -e "  Paramètres → Mise à jour → Vérifier, puis « Mettre à jour le panel ».${N}"
