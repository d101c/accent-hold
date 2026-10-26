#!/usr/bin/env bash
# End-to-end check against a real ibus-daemon, fully isolated from the
# desktop session: private D-Bus, in-memory GSettings, temporary XDG dirs and
# address file. Nothing in the user's session or settings is touched.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="$(dirname "$HERE")/engine.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export GSETTINGS_BACKEND=memory
export XDG_CONFIG_HOME="$TMP/config" XDG_CACHE_HOME="$TMP/cache" XDG_RUNTIME_DIR="$TMP/run"
export IBUS_ADDRESS_FILE="$TMP/ibus-address"
export IBUS_COMPONENT_PATH="$TMP/component"
unset WAYLAND_DISPLAY DISPLAY IBUS_ADDRESS
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR" "$IBUS_COMPONENT_PATH"
chmod 700 "$XDG_RUNTIME_DIR"
python3 "$ENGINE" --component > "$IBUS_COMPONENT_PATH/accent-hold.xml"

exec dbus-run-session -- bash -c '
    export IBUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/ibus.sock"
    ibus-daemon --address="$IBUS_ADDRESS" --single --panel=disable --emoji-extension=disable --cache=refresh 2>"$XDG_RUNTIME_DIR/daemon.log" &
    daemon=$!
    for _ in $(seq 50); do [[ -s "$IBUS_ADDRESS_FILE" ]] && break; sleep 0.1; done
    sleep 0.5
    python3 "'"$HERE"'/live_client.py"; status=$?
    kill $daemon 2>/dev/null
    [[ $status -eq 0 ]] || cat "$XDG_RUNTIME_DIR/daemon.log" >&2
    exit $status
'
