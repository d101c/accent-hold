#!/usr/bin/env bash
# Crée le .zip prêt à uploader sur extensions.gnome.org (EGO).
# EGO compile les schémas côté serveur ; on fournit juste les sources.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/extension"

gnome-extensions pack \
    --force \
    --extra-source=accentPicker.js \
    --extra-source=accents.json \
    --schema=schemas/org.gnome.shell.extensions.accent-hold.gschema.xml \
    --out-dir="$HERE"

echo "Paquet créé : $HERE/accent-hold@local.shell-extension.zip"
echo "Upload sur https://extensions.gnome.org/upload/ (review GNOME requise)."
