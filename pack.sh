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
DOMAIN="accent-hold"
ZIP="$REPO/accent-hold@griffit.gmail.com.shell-extension.zip"

# Compile every translation (po/*.po -> locale/<lang>/LC_MESSAGES/<domain>.mo)
# so the source tree carries up-to-date .mo files (used when running the
# extension straight from ~/.local/share/gnome-shell/extensions).
if command -v msgfmt >/dev/null 2>&1; then
    for po in "$SRC"/po/*.po; do
        [ -e "$po" ] || continue
        lang="$(basename "$po" .po)"
        dest="$SRC/locale/$lang/LC_MESSAGES"
        mkdir -p "$dest"
        msgfmt "$po" -o "$dest/$DOMAIN.mo"
        echo "Compiled: $po -> $dest/$DOMAIN.mo"
    done
else
    echo "WARNING: msgfmt not found (install the 'gettext' package); translations not recompiled." >&2
fi

# extension.js, metadata.json, prefs.js and stylesheet.css are picked up
# automatically by `gnome-extensions pack`. The picker module, the panel
# indicator module, the accent table module and the GSettings schema must be
# declared explicitly. `--podir`/`--gettext-domain` compile po/*.po into the
# bundle's locale/ directory.
gnome-extensions pack "$SRC" \
  --extra-source=accentPicker.js \
  --extra-source=defaultAccents.js \
  --extra-source=panelIndicator.js \
  --podir=po \
  --gettext-domain="$DOMAIN" \
  --schema="$SCHEMA" \
  --out-dir="$REPO" \
  --force

# `gnome-extensions pack` flattens --extra-source files to their basename, so it
# cannot preserve the icons/ subdirectory the extension loads its symbolic icon
# from. Inject the directory tree into the zip afterwards (path preserved).
( cd "$SRC" && zip -r -q "$ZIP" icons )

echo "Built: $ZIP"
echo "Upload it at https://extensions.gnome.org/upload/"
