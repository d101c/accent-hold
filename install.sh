#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> Build daemon"
( cd "$HERE/daemon" && cargo build --release )

echo "==> Install binary + data (sudo)"
sudo install -Dm755 "$HERE/daemon/target/release/accent-holdd" /usr/local/bin/accent-holdd
sudo install -Dm644 "$HERE/accents.json" /usr/local/share/accent-hold/accents.json

echo "==> udev rule for /dev/uinput (sudo)"
sudo install -Dm644 "$HERE/packaging/99-accent-hold.rules" /etc/udev/rules.d/99-accent-hold.rules
sudo udevadm control --reload-rules && sudo udevadm trigger

echo "==> input group"
if ! id -nG "$USER" | grep -qw input; then
    sudo usermod -aG input "$USER"
    echo "   (déconnexion/reconnexion requise pour le groupe input)"
fi

echo "==> Ensure uinput module loads at boot"
echo uinput | sudo tee /etc/modules-load.d/uinput.conf >/dev/null

echo "==> systemd --user service"
install -Dm644 "$HERE/packaging/accent-holdd.service" \
    "$HOME/.config/systemd/user/accent-holdd.service"
systemctl --user daemon-reload
systemctl --user enable accent-holdd.service

echo "==> GNOME extension"
DEST="$HOME/.local/share/gnome-shell/extensions/accent-hold@local"
mkdir -p "$DEST"
cp "$HERE/extension/"* "$DEST/"
cp "$HERE/accents.json" "$DEST/"

cat <<'EOF'

Installation terminée.
1) Déconnecte-toi puis reconnecte-toi (groupe input + détection de l'extension).
2) Active l'extension :  gnome-extensions enable accent-hold@local
3) Démarre le daemon  :  systemctl --user start accent-holdd
4) Teste : maintiens 'e' dans un éditeur ou un terminal.
EOF
