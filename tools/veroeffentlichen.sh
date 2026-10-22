#!/bin/bash
# ---------------------------------------------------------------------------
# veroeffentlichen.sh — bringt den Arbeitsstand ins Veröffentlichungs-Repo.
#
# Warum es das gibt: Gearbeitet wird in mein-assistent/BerisaBauApp/, live geht
# aber das eigene Repo daiworld450/WerkBuch. Bis hierher wurde von Hand
# kopiert — und genau daher kam "ich habe es geändert und live ist es nicht".
# Dieses Skript macht den Abgleich in einem Schritt und zeigt vorher, was sich
# ändert.
#
#   BerisaBauApp/tools/veroeffentlichen.sh            (fragt vor dem Senden)
#   BerisaBauApp/tools/veroeffentlichen.sh --ohne-nachfrage
# ---------------------------------------------------------------------------
set -euo pipefail

QUELLE="$(cd "$(dirname "$0")/.." && pwd)"
ZIEL="$HOME/WerkBuch-deploy"

if [ ! -d "$ZIEL/.git" ]; then
  echo "Das Veröffentlichungs-Repo fehlt. Einmalig anlegen mit:"
  echo "  gh repo clone daiworld450/WerkBuch $ZIEL"
  exit 1
fi

echo "→ Aktuellen Stand des Veröffentlichungs-Repos holen"
git -C "$ZIEL" pull --quiet --ff-only

echo "→ Abgleichen"
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude '.expo/' \
  --exclude '.secrets/' \
  --exclude '.wrangler/' \
  --exclude '.lokal-test/' \
  --exclude '.claude-flow/' \
  --exclude 'WerkBuch-Sicherungen/' \
  --exclude '*.log' \
  --exclude 'regeln-ergebnis.txt' \
  "$QUELLE/" "$ZIEL/"

cd "$ZIEL"
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "Nichts zu veröffentlichen — live ist bereits der aktuelle Stand."
  exit 0
fi

echo
echo "Diese Dateien ändern sich:"
git status --short
echo

if [ "${1:-}" != "--ohne-nachfrage" ]; then
  read -r -p "Veröffentlichen? [j/N] " antwort
  case "$antwort" in
    j|J|ja|Ja) ;;
    *) echo "Abgebrochen. Im Veröffentlichungs-Repo liegt jetzt der neue Stand, ungesendet."; exit 0 ;;
  esac
fi

NACHRICHT="${WERKBUCH_COMMIT:-WerkBuch: Stand aus dem Arbeitsverzeichnis übernommen}"
git add -A
git commit -q -m "$NACHRICHT"
git push --quiet
echo
echo "Gesendet. Der Bau läuft jetzt — Stand ansehen mit:"
echo "  gh run watch -R daiworld450/WerkBuch"
