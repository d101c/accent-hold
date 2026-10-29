# Accent Hold

*Lire dans une autre langue : [English](README.md)*

> **Tapez les caractères accentués à la façon macOS : maintenez la lettre.**
> Maintenez `e`, `a`, `c`, `o`, `n` … et ses variantes (`é è ê ë`, `ç`, `ñ`,
> `ô` …) apparaissent à côté du curseur de texte ; une frappe normale tape la
> lettre. Un raccourci (`Super+E`) fait la même chose partout ailleurs.
> Extension GNOME Shell pure : aucun daemon, aucun privilège, aucune
> dépendance, installable en un clic depuis extensions.gnome.org.

![Accent Hold en action](docs/demo.gif)

## Utilisation

**Appui long** (champs texte, éditeurs, terminal…) :

1. maintiens une lettre : `e`, `a`, `c`, `o`, `u`, `n`, `s`, `i`, `y`, `z`
2. choisis la variante : `1`–`9` (par position de touche, donc ça marche en
   AZERTY, QWERTZ…), ou `←`/`→` + `Entrée`, ou clic. `Échap` garde la lettre
   simple.

La lettre maintenue ne se répète pas. `E` (avec Maj) propose `É È Ê Ë …`.

**Raccourci**, pour les applications qui n'utilisent pas la méthode de saisie
de GNOME :

1. `Super+E` (configurable)
2. tape une lettre de base
3. choisis la variante de la même façon.

## Installer

### Pour un utilisateur (le plus simple)
Sur [**extensions.gnome.org**](https://extensions.gnome.org/extension/10265/accent-hold/) (GNOME 45 à 50), clique **« Install »**. Fin. Pas de terminal,
pas de sudo, pas de daemon — c'est une extension Shell pure.

### Construire le paquet à uploader
```bash
./pack.sh
```
Génère `accent-hold@griffit.gmail.com.shell-extension.zip` à la racine du dépôt,
prêt à être déposé sur <https://extensions.gnome.org/upload/>.

### En local (dev)
```bash
gnome-extensions install --force accent-hold@griffit.gmail.com.shell-extension.zip
# déconnexion/reconnexion (Wayland), puis :
gnome-extensions enable accent-hold@griffit.gmail.com
```

## Préférences

Panneau de configuration intégré (icône réglages dans l'app *Extensions*, ou
`gnome-extensions prefs accent-hold@griffit.gmail.com`) :

- **Appui long** : activer ou non, et durée d'appui (400 ms par défaut).
- **Raccourci** : la touche qui ouvre le sélecteur (défaut `Super+E`).
- **Activer / inhiber** : coupe le raccourci sans désinstaller l'extension.
- **Délai (ms)** : latence avant l'affichage de la popup (0–1000).
- **Caractères** : table des variantes accentuées (JSON), surchargeable.
- **Claviers** : liste des layouts xkb où l'extension est active (vide = tous).

Tout est stocké dans GSettings
(`org.gnome.shell.extensions.accent-hold`). En CLI :
```bash
gsettings set org.gnome.shell.extensions.accent-hold trigger "['<Super>grave']"
```

## Moteur IBus optionnel (applications X11)

L'appui long marche dans toutes les applications qui utilisent la méthode de
saisie de GNOME (GTK, la plupart des applis Qt, terminaux). Pour les
anciennes applications X11, le moteur [`ibus/`](ibus/) offre le même geste via
IBus. La plupart des gens n'en ont pas besoin.

```bash
curl -L https://github.com/d101c/accent-hold/archive/refs/tags/v2.0.tar.gz | tar xz
accent-hold-2.0/ibus/install.sh --replace
```
Depuis un clone : `./ibus/install.sh --replace` (ou `--add-source`). Il faut
les bindings Python d'IBus, déjà présents sur la plupart des bureaux GNOME
(sinon `sudo apt install python3-gi gir1.2-ibus-1.0`, ou `sudo dnf install
python3-gobject ibus`).

Sans `sudo`. Une source de saisie est générée par disposition clavier utilisée
(« Français (Accent Hold) », « Anglais (Accent Hold) »…). Quand l'une d'elles
est sélectionnée, l'extension laisse les touches au moteur. Désinstallation :
`./ibus/uninstall.sh`.

Fonctionnement : l'installeur ajoute une petite option xkb
(`accenthold:norepeat`, fichiers dans `~/.config/xkb`) qui marque seulement
les lettres accentuables (a, e, i, o, u, c, n, y, s, z de vos dispositions)
comme « sans répétition », comme sur macOS. Une lettre maintenue tape un seul
caractère et ouvre le sélecteur au lieu de `eeee` ; les flèches, Suppr, les
touches de volume et toutes les autres gardent la répétition native du
bureau, partout. Relancez l'installeur après avoir ajouté une disposition.

Les préférences (table d'accents, délai) s'ouvrent depuis le menu des sources
de saisie de GNOME (« fr » dans la barre du haut) › *Préférences Accent
Hold…* : avec le moteur, l'icône propre de l'extension peut être masquée.

## Fonctionnement de l'appui long

Sous Wayland, la méthode de saisie de GNOME Shell voit chaque touche tapée
dans un champ texte avant de la passer à IBus. L'extension observe ces
touches : une lettre tapée passe telle quelle ; une lettre accentuable
maintenue ouvre les variantes, ses répétitions sont ignorées, et la variante
choisie remplace la lettre déjà tapée. Seuls les chiffres, les flèches,
`Entrée` et `Échap` sont retenus pendant l'affichage des variantes.
L'ancienne variante daemon evdev est archivée dans [`legacy/`](legacy/).

## Alternative zéro-install : la touche Compose

Sans rien installer, GNOME sait déjà taper les accents partout :
```bash
gsettings set org.gnome.desktop.input-sources xkb-options "['compose:caps']"
```
Puis `Compose`(Verr.Maj) `e` `'` → é. Pas de popup, mais zéro dépendance.

## Crédits

La technique d'appui long (lettre maintenue empêchée de se répéter, lettre
remplacée après coup) vient de
[gnome-accent-hold](https://github.com/manux81/gnome-accent-hold) de
**Manuele Conti**. Merci ! L'extension et le moteur IBus en sont des
implémentations indépendantes.

## Licence

[GPL-2.0-or-later](LICENSE).
