#!/usr/bin/env bash
# Installation DEV (locale) de l'extension. Aucun sudo, aucune dépendance,
# aucun daemon. Pour distribuer à des utilisateurs, voir README (extensions.gnome.org).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
UUID="accent-hold@local"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

if [ "$(id -u)" -eq 0 ]; then
    echo "ERREUR : lance ce script SANS sudo." >&2
    exit 1
fi

mkdir -p "$DEST"
cp -r "$HERE/extension/." "$DEST/"
glib-compile-schemas "$DEST/schemas/"

cat <<EOF
Extension installée dans $DEST

Ensuite :
  1. Déconnecte/reconnecte-toi UNE fois (Wayland doit détecter la nouvelle extension).
  2. gnome-extensions enable $UUID
  3. Appuie sur Super+E, tape une lettre (e, a, c, o, u…), choisis la variante.

Changer le raccourci :
  dconf write /org/gnome/shell/extensions/accent-hold/trigger "['<Super>grave']"
EOF
