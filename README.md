# accent-hold

Popup de variantes accentuées (é è ê ç ô ñ …) pour GNOME, insérées dans
**n'importe quel champ texte ou terminal**. Pure extension GNOME Shell — **aucun
daemon, aucune dépendance, aucun privilège**.

## Utilisation

1. `Super+E` (raccourci configurable)
2. tape une lettre de base : `e`, `a`, `c`, `o`, `u`, `n`, `s`, `i`, `y`, `z`
3. choisis la variante : `1`–`9`, ou `←`/`→` + `Entrée`, ou clic. `Échap` annule.

Le caractère est inséré dans le champ qui avait le focus (terminal compris).
Shift est détecté : `E` propose `É È Ê Ë …`.

## Installer

### Pour un utilisateur (le plus simple — à venir)
Publier sur **extensions.gnome.org** → l'utilisateur clique **« Install »**. Fin.
Pas de terminal, pas de sudo. Construire le paquet à uploader : `./pack.sh`.

### En local (dev)
```bash
./install-extension.sh      # copie dans ~/.local/share/... (sans sudo)
# déconnexion/reconnexion (Wayland), puis :
gnome-extensions enable accent-hold@local
```

## Changer le raccourci
```bash
dconf write /org/gnome/shell/extensions/accent-hold/trigger "['<Super>grave']"
```

## Pourquoi un raccourci et pas « maintenir la lettre » ?

Sous Wayland, intercepter le **maintien d'une lettre normale** dans une autre
application impose un accès clavier privilégié (evdev) → daemon + `sudo` + groupe
`input` + `udev` : impossible à distribuer simplement. Le raccourci global est
capté nativement par le Shell, sans aucun privilège — d'où une extension
installable en un clic.

La variante « vrai maintien de la lettre » (daemon Rust evdev + uinput) existe
dans [`legacy/`](legacy/) : plus fidèle à macOS, mais install lourde
(`sudo`, `usermod`, `udev`, logout). Non recommandée pour la distribution.

## Alternative zéro-install : la touche Compose
Sans rien installer, GNOME sait déjà taper les accents partout :
```bash
gsettings set org.gnome.desktop.input-sources xkb-options "['compose:caps']"
```
Puis `Compose`(Verr.Maj) `e` `'` → é. Pas de popup, mais zéro dépendance.
