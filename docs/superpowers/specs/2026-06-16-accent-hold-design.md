# accent-hold — Design

**Date:** 2026-06-16
**Cible:** Ubuntu 26.04, GNOME Shell 50, session **Wayland**, IBus actif, claviers fr+us.

## 1. Objectif

Reproduire l'UX macOS « press-and-hold » : maintenir une touche accentuable
(`e`, `a`, `c`, `u`, …) fait apparaître une **popup de variantes accentuées**,
sélectionnable au clavier, qui insère le caractère choisi — dans **n'importe quelle
zone de texte** ET dans le **terminal**.

Socle déjà en place (hors périmètre de ce projet) : touche **Compose** activée
(`compose:caps`) comme palliatif natif fonctionnant partout.

## 2. Contraintes vérifiées (recherche du 2026-06-16)

Ces faits dictent l'architecture ; ils ne sont pas négociables sur GNOME/Wayland :

1. **Détecter** le maintien ne peut se faire que **sous le compositeur** (evdev).
   Sous Wayland, Mutter route les frappes directement à la surface focalisée ; une
   extension GNOME ne peut pas observer une frappe puis la laisser passer, et
   l'auto-répétition est générée côté client (jamais transmise à l'IME).
   → Réf : mutter#973, csslayer key-repeat Wayland, ibus#2610.
2. **Injecter** un caractère Unicode arbitraire, terminal compris, se fait proprement
   depuis l'**extension GNOME** via le périphérique virtuel Clutter
   (`Seat.create_virtual_device` + `notify_keyval`) — prouvé par GJS-OSK.
3. **Popup au caret impossible** : seul un IME connaît la position du curseur texte.
   Une extension ne connaît que la position **souris**. → La popup s'affiche au
   pointeur. Compromis assumé.
4. La voie « moteur IBus » est écartée : détection du hold cassée sur Wayland +
   terminaux n'affichant pas de fenêtre de candidats.

## 3. Architecture

Trois composants + une table de données.

```
┌─ accent-holdd (daemon, Rust, service systemd --user) ─────┐
│ EVIOCGRAB du/des clavier(s) → ré-émet tout via uinput      │
│ machine tap/hold : maintien ≥450ms d'une lettre accentuable│
│   → avale la lettre + émet signal D-Bus AccentRequested(c) │
│   → tap (relâché avant 450ms) : ré-émet la lettre normale  │
└────────────────────────────────────────────────────────────┘
              │ D-Bus session  signal AccentRequested(string letter)
              ▼
┌─ extension GNOME Shell (GJS) ──────────────────────────────┐
│ service D-Bus ; à réception de la lettre :                  │
│   lit accents.json → variantes                              │
│   overlay St au pointeur (global.get_pointer())            │
│   pushModal → capture 1-9 / ← → / Entrée / Échap           │
│   choix → notify_keyval(unicode) via Clutter virtual device│
│   popModal                                                  │
└────────────────────────────────────────────────────────────┘

accents.json  ← table des variantes, dérivée des plists macOS
```

### 3.1 Daemon `accent-holdd` (Rust)

- **But :** détecter tap vs hold des lettres accentuables, sans casser la frappe.
- **Dépendances :** crate `evdev` (lecture + uinput), `zbus` (D-Bus session).
- **Interface :**
  - Entrée : événements des périphériques clavier `/dev/input/event*`.
  - Sortie 1 : un périphérique virtuel `uinput` qui ré-émet la frappe.
  - Sortie 2 : signal D-Bus `AccentRequested(s)` sur le bus **session**
    (nom `dev.accenthold.Daemon`, objet `/dev/accenthold/Daemon`).
- **Logique (par touche accentuable) :**
  1. KEY_DOWN d'une lettre dans la table → **ne pas** ré-émettre tout de suite ;
     armer un timer 450 ms ; mémoriser la lettre.
  2. KEY_UP avant 450 ms → ré-émettre DOWN+UP (tap normal).
  3. Timer expiré (touche encore tenue) → émettre `AccentRequested(lettre)` ;
     ne jamais ré-émettre la lettre ; entrer en état « popup ouverte ».
  4. État « popup ouverte » : ignorer le KEY_UP de la lettre tenue. Les touches de
     sélection (chiffres/flèches/Entrée/Échap) sont ré-émises normalement et
     capturées par le **grab modal** de l'extension (au-dessus de l'app).
  5. Les touches **non accentuables** sont toujours ré-émises sans délai
     (latence nulle pour la frappe courante).
- **Seuil :** 450 ms, lu depuis un fichier de config (`~/.config/accent-hold/config.toml`),
  défaut 450.
- **Sécurité de repli :** si l'extension ne répond pas dans un délai court après
  `AccentRequested`, le daemon revient à l'état neutre (pas de blocage clavier).

### 3.2 Extension GNOME Shell (GJS)

- **But :** UI de la popup + capture de la sélection + injection.
- **Interface :**
  - Reçoit le signal D-Bus `AccentRequested(lettre)`.
  - Affiche un overlay `St.BoxLayout` (chips numérotés) à `global.get_pointer()`.
  - `Main.pushModal()` pour capter `1`-`9`, `Left`/`Right`, `Return`, `Escape`.
  - Injection : `Clutter.Seat.create_virtual_device(KEYBOARD)` +
    `notify_keyval(time, keyval, PRESSED/RELEASED)` où `keyval` est dérivé du
    code point Unicode (`Clutter.unicode_to_keysym` / `0x01000000 | codepoint`).
  - `Main.popModal()` après injection ou annulation.
- **Comportement :**
  - `1`-`9` : insère la variante correspondante.
  - `←`/`→` : déplace la surbrillance ; `Entrée` : valide la surbrillance.
  - `Échap` : ferme sans rien insérer.
  - Clic sur une chip : valide.

### 3.3 `accents.json`

- **But :** mapper chaque lettre de base → liste ordonnée de variantes
  (caractère affiché = caractère inséré).
- **Source :** plists macOS `PressAndHold` (gist casouri / repo michiexile).
- **Couverture initiale :** `a e i o u y n c s z g` + majuscules.
  Ex. `e` → `é è ê ë ē ė ę` ; `c` → `ç ć č` ; `n` → `ñ ń` ; `a` → `à á â ä æ ã å ā`.
- **Format :**
  ```json
  { "e": ["é","è","ê","ë","ē","ė","ę"],
    "c": ["ç","ć","č"], "...": [] }
  ```

### 3.4 Installeur

- Script `install.sh` :
  - Ajoute l'utilisateur au groupe `input` (si absent).
  - Installe une règle udev `/etc/udev/rules.d/99-accent-hold.rules` :
    `KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"`.
  - Compile (`cargo build --release`) et installe le binaire daemon.
  - Installe + active le service `systemd --user` `accent-holdd.service`.
  - Copie l'extension dans `~/.local/share/gnome-shell/extensions/` et l'active.
  - Avertit qu'une déconnexion/reconnexion est nécessaire (groupe input).

## 4. Flux de bout en bout

1. Maintien de `e` → daemon avale `e`, arme 450 ms.
2. Relâché < 450 ms → daemon ré-émet `e` (tap). Fin.
3. Tenu ≥ 450 ms → daemon émet `AccentRequested("e")`.
4. Extension : overlay au pointeur + grab modal ; user tape `3`.
5. Extension injecte `ê` via Clutter (GTK/Qt **et terminal**), relâche le grab.
6. `Échap` → rien inséré, grab relâché.

## 5. Couverture & limites (assumées)

- ✅ zones de texte GTK/Qt + **terminal** (gnome-terminal/VTE).
- ⚠️ **Popup au pointeur souris, pas au caret** (limite Mutter, irréductible).
- ⚠️ Electron/Chromium : injection à valider au cas par cas.
- ⚠️ Couplage à l'API GNOME Shell : susceptible de casser à une montée de version
  majeure (comme toute extension).

## 6. Tests

- **Daemon (unitaire) :** machine tap/hold pilotée par des événements simulés
  (pas de vrai clavier) — vérifie tap<450ms = ré-émission, hold≥450ms = signal,
  touches non accentuables = passthrough immédiat.
- **Table :** test de validation (JSON parseable, lettres attendues présentes,
  chaque variante = 1 code point non vide).
- **Bout-en-bout (manuel) :** checklist sur gedit/GNOME Text Editor, Firefox,
  gnome-terminal — `é è ê ë ç ù` insérés correctement.

## 7. Hors périmètre (YAGNI)

- Pas de popup au caret (impossible proprement ici).
- Pas de support X11 (session Wayland).
- Pas de configuration GUI ; config par fichier TOML.
- Pas de packaging .deb/AUR pour le MVP (install.sh suffit).
- Pas de variante « trigger explicite » (hold+flèche) au MVP — timeout pur retenu ;
  l'architecture la permettra plus tard sans refonte.

## 8. Risques principaux

1. **Synchro daemon ↔ extension** (avalement lettre / affichage / sélection /
   injection) : principale source de bugs. Mitigation : état explicite + timeout de
   repli côté daemon.
2. **Injection Unicode en terminal** : point fragile ; valider tôt sur
   gnome-terminal (spike technique avant le reste).
3. **Permissions** : groupe input + udev uinput obligatoires ; déconnexion requise.
4. **Multi-claviers / hot-plug** : le daemon doit gérer plusieurs `event*` et
   l'ajout/retrait à chaud (sinon clavier ignoré après branchement).

## 9. Références

- mutter#973 (layer-shell refusé) — https://gitlab.gnome.org/GNOME/mutter/-/issues/973
- csslayer key-repeat Wayland — https://www.csslayer.info/wordpress/linux/key-repetition-and-key-event-handling-issue-with-wayland-input-method-protocols/
- ibus#2610 — https://github.com/ibus/ibus/issues/2610
- GJS-OSK (injection Clutter) — https://github.com/Vishram1123/gjs-osk
- xremap-gnome (précédent daemon+extension) — https://github.com/xremap/xremap
- Table macOS (extraction) — https://gist.github.com/casouri/3015678383ffb43dbbbbac91c88c06dc
- crate evdev (Rust) — https://docs.rs/evdev
- PowerToys Quick Accent (réf UX) — https://learn.microsoft.com/en-us/windows/powertoys/quick-accent
