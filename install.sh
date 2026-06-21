#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

# NE PAS lancer avec sudo : le script appelle sudo lui-même là où il faut.
# Lancé en root, $USER vaut 'root' -> usermod ajouterait root (pas toi) au
# groupe input, et systemctl --user / $HOME viseraient le mauvais compte.
if [ "$(id -u)" -eq 0 ]; then
    echo "ERREUR : lance ce script SANS sudo (il demandera sudo quand nécessaire)." >&2
    echo "        ->  ./install.sh" >&2
    exit 1
fi

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

echo "==> systemd --user service (installé mais PAS activé : test manuel d'abord)"
install -Dm644 "$HERE/packaging/accent-holdd.service" \
    "$HOME/.config/systemd/user/accent-holdd.service"
systemctl --user daemon-reload
# NOTE: on n'active PAS le service ici. Le daemon grabbe le clavier ; on le teste
# d'abord manuellement avec un filet de sécurité (timeout) avant l'activation auto.

echo "==> GNOME extension"
DEST="$HOME/.local/share/gnome-shell/extensions/accent-hold@local"
mkdir -p "$DEST"
cp "$HERE/extension/"* "$DEST/"
cp "$HERE/accents.json" "$DEST/"

BIN=/usr/local/bin/accent-holdd
cat <<EOF

Installation terminée.

1) Déconnecte-toi puis reconnecte-toi (groupe input + détection de l'extension).

2) Active l'extension :
     gnome-extensions enable accent-hold@local

3) TEST DU DAEMON avec filet de sécurité (s'auto-tue après 25s même si le
   clavier est grabbé — garde une souris à portée). SANS sudo : le groupe
   'input' + la règle udev suffisent, et le bus de session reste accessible :
     timeout 25 env ACCENT_HOLD_MS=450 $BIN
   Puis maintiens 'e' dans un éditeur ET dans un terminal -> popup d'accents.

4) Si le test est concluant, active le démarrage automatique :
     systemctl --user enable --now accent-holdd
   (le daemon tourne alors sans sudo grâce au groupe input + règle udev)
EOF
