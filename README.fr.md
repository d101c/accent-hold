# Accent Hold

*Lire dans une autre langue : [English](README.md)*

> **Tapez les caractères accentués à la façon macOS — sans daemon ni privilèges.**
> Appuyez sur un raccourci configurable, tapez une lettre de base (`e`, `a`, `c`,
> `o`, `n` …), puis choisissez la variante accentuée voulue (`é è ê ë`, `ç`, `ñ`,
> `ô` …) dans une popup nette. Le caractère est inséré là où se trouve le curseur —
> champs texte, éditeurs et terminal compris. Un panneau de préférences intégré
> permet de régler le raccourci, le délai, la table de caractères et les claviers
> actifs. Extension GNOME Shell pure — aucun daemon, aucun privilège, aucune
> dépendance, installable en un clic depuis extensions.gnome.org.

![Accent Hold en action](docs/demo.gif)

## Utilisation

1. `Super+E` (raccourci configurable)
2. tape une lettre de base : `e`, `a`, `c`, `o`, `u`, `n`, `s`, `i`, `y`, `z`
3. choisis la variante : `1`–`9`, ou `←`/`→` + `Entrée`, ou clic. `Échap` annule.

Le caractère est inséré dans le champ qui avait le focus (terminal compris).
Shift est détecté : `E` propose `É È Ê Ë …`.

## Installer

### Pour un utilisateur (le plus simple)
Sur **extensions.gnome.org**, clique **« Install »**. Fin. Pas de terminal,
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

## Mode « vrai maintien » (moteur IBus)

Vous préférez le geste macOS ? Le moteur [`ibus/`](ibus/) apporte le **vrai
maintien de la lettre** : une frappe normale tape la lettre ; un appui long
affiche les variantes **à côté du curseur de texte**. Choisissez avec `1`–`9`
(par position de touche, donc ça marche en AZERTY, QWERTZ…), les flèches +
`Entrée`, ou la souris. `Échap` garde la lettre simple.

```bash
./ibus/install.sh --add-source
```

Sans `sudo`. Une source de saisie est générée par disposition clavier utilisée
(« Français (Accent Hold) », « Anglais (Accent Hold) »…) : même disposition,
accents en plus. `--add-source` l'ajoute à côté de la vôtre (bascule avec
`Super+Espace`) ; `--replace` remplace vos dispositions par leur version
Accent Hold, pour avoir les accents partout sans rien choisir. Le moteur lit la même table d'accents que les préférences de
l'extension. Désinstallation : `./ibus/uninstall.sh`.

Fonctionnement : tant que le moteur a le focus, il coupe la répétition des
touches du bureau et répète lui-même les touches ordinaires ; une lettre
maintenue tape donc un seul caractère et ouvre le sélecteur au lieu de
`eeee`. La répétition est rendue dès qu'on quitte le moteur, même après un
plantage. Les applications qui contournent IBus n'ont pas de répétition des
touches tant que cette source est active.

## Pourquoi l'extension utilise-t-elle un raccourci ?

Sous Wayland, une extension GNOME Shell ne peut pas voir qu'une lettre est
maintenue dans une autre application : l'extension utilise donc un raccourci
global capté par le Shell (installation en un clic, rien d'autre). Pour le geste
de maintien, utilisez le moteur IBus ci-dessus. L'ancienne variante daemon evdev
est archivée dans [`legacy/`](legacy/).

## Alternative zéro-install : la touche Compose

Sans rien installer, GNOME sait déjà taper les accents partout :
```bash
gsettings set org.gnome.desktop.input-sources xkb-options "['compose:caps']"
```
Puis `Compose`(Verr.Maj) `e` `'` → é. Pas de popup, mais zéro dépendance.

## Crédits

La technique de maintien utilisée par le moteur IBus (répétition des touches
coupée tant que le moteur a le focus, touches ordinaires répétées par le moteur,
panneau de candidats IBus natif) vient de
[gnome-accent-hold](https://github.com/manux81/gnome-accent-hold) de
**Manuele Conti**. Merci ! Notre moteur en est une implémentation
indépendante.

## Licence

[GPL-2.0-or-later](LICENSE).
