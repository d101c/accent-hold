#!/usr/bin/env bash
# Remove the Accent Hold IBus engine installed by install.sh.
set -euo pipefail

DEST="${XDG_DATA_HOME:-$HOME/.local/share}/accent-hold"
COMPONENT="${XDG_DATA_HOME:-$HOME/.local/share}/ibus/component/accent-hold.xml"

# Drop our input sources from GNOME's list.
python3 - <<'EOF'
from gi.repository import Gio, GLib
s = Gio.Settings.new('org.gnome.desktop.input-sources')
sources = s.get_value('sources').unpack()
kept = [src for src in sources if not (src[0] == 'ibus' and src[1].startswith('accent-hold:'))]
if kept != sources:
    s.set_value('sources', GLib.Variant('a(ss)', kept))
    Gio.Settings.sync()
EOF

# Give key repeat back if the engine had it switched off.
MARKER="${XDG_RUNTIME_DIR:-/tmp}/accent-hold-repeat-off"
if [[ -e "$MARKER" ]]; then
    gsettings set org.gnome.desktop.peripherals.keyboard repeat true
    rm -f "$MARKER"
fi

rm -rf "$DEST" "$COMPONENT"
rm -f "$HOME/.config/environment.d/90-accent-hold.conf"
for dropin in "$HOME"/.config/systemd/user/org.freedesktop.IBus.session.*.service.d/accent-hold.conf; do
    [[ -e "$dropin" ]] || continue
    unit="$(basename "$(dirname "$dropin")" .d)"
    rm -f "$dropin"
    rmdir --ignore-fail-on-non-empty "$(dirname "$dropin")"
    systemctl --user daemon-reload
    ibus write-cache
    systemctl --user restart "$unit"
done

echo "Accent Hold IBus engine removed."
