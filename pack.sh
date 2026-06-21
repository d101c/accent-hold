#!/usr/bin/env bash
# Build the uploadable bundle for extensions.gnome.org.
#
# Produces accent-hold@griffit.gmail.com.shell-extension.zip in the repo root.
# Upload that zip on https://extensions.gnome.org/upload/ (one-click install for
# end users — no daemon, no sudo).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$REPO/extension"
SCHEMA="schemas/org.gnome.shell.extensions.accent-hold.gschema.xml"

# extension.js, metadata.json, prefs.js and stylesheet.css are picked up
# automatically by `gnome-extensions pack`. Only the picker module, the accent
# table and the GSettings schema must be declared explicitly.
gnome-extensions pack "$SRC" \
  --extra-source=accentPicker.js \
  --extra-source=accents.json \
  --schema="$SCHEMA" \
  --out-dir="$REPO" \
  --force

echo "Built: $REPO/accent-hold@griffit.gmail.com.shell-extension.zip"
echo "Upload it at https://extensions.gnome.org/upload/"
