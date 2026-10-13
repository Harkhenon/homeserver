#!/usr/bin/env bash
# updater-core.sh — le "bootloader" du couple Homeserver updater.
# Rôle unique : handcheck mutuel avec updater.sh, le réparer si besoin,
# puis lui déléguer toute la logique (check, apply, self-update).
# Ne doit quasiment jamais évoluer. Toute logique métier vit dans updater.sh.
set -euo pipefail

#=== BEGIN INJECTED pair.sh (généré par make-release.sh, ne pas éditer) ===
___PAIR_SH___
#=== END INJECTED pair.sh ===

log() { echo "[$(date -u +%FT%TZ)] core: $1" >&2; }

SELF="updater-core.sh"
OTHER="updater.sh"
MODE="${1:-health}"

case "$MODE" in
  health)
    # Bonjour, comment ça va : vérifie l'autre moitié, répare si besoin.
    if pair_health "$SELF" "$OTHER" | grep -q '^ok$'; then
      echo '{"core": "ok", "updater": "ok"}'
      exit 0
    fi
    log "updater défectueux — tentative de réparation"
    if pair_repair; then
      if pair_health "$SELF" "$OTHER" | grep -q '^ok$'; then
        echo '{"core": "ok", "updater": "repaired"}'
        exit 0
      fi
    fi
    echo '{"core": "ok", "updater": "broken"}'
    exit 1
    ;;
  run)
    # Délégation : le core ne fait que lancer updater.sh avec les mêmes arguments.
    if ! pair_health "$SELF" "$OTHER" | grep -q '^ok$'; then
      pair_repair || { log "réparation impossible"; exit 1; }
    fi
    exec bash "$PAIR_DIR/updater.sh" "${@:2}"
    ;;
  repair)
    pair_repair
    ;;
  *)
    echo "Usage: updater-core.sh {health|run <check|apply>|repair}" >&2
    exit 1
    ;;
esac
