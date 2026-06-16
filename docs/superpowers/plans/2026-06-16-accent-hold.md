# accent-hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maintenir une touche accentuable fait apparaître une popup de variantes (style macOS), sélectionnable au clavier, insérée dans n'importe quelle zone de texte et dans le terminal, sous GNOME 50 / Wayland.

**Architecture:** Daemon Rust (evdev+uinput) détecte tap-vs-hold sous le compositeur et appelle une méthode D-Bus de l'extension ; l'extension GNOME (GJS) affiche la popup au pointeur, capture la sélection via grab modal, et injecte le caractère Unicode via le périphérique virtuel Clutter (fonctionne en terminal). Une table `accents.json` partagée est la source unique des lettres accentuables (côté daemon) et des variantes (côté extension).

**Tech Stack:** Rust (crates `evdev`, `zbus`, `serde_json`), GJS / GNOME Shell extension API, D-Bus session, systemd --user, udev. Dev loop via `gnome-shell --nested`.

---

## Contraintes d'environnement (vérifiées 2026-06-16)

- Rust ABSENT → installer en Phase 0.
- `org.gnome.Shell.Eval` DÉSACTIVÉ → pas d'injection GJS à chaud. Test des extensions
  via **GNOME Shell imbriqué** (`dbus-run-session -- gnome-shell --nested --wayland`),
  relançable sans logout. Validation finale = 1 logout/login sur la vraie session.
- `/dev/uinput` présent (root) → règle udev pour accès groupe `input`.
- D-Bus session opérationnel.

## File Structure

```
accent-hold/
├── accents.json                 # SOURCE UNIQUE : { "e": ["é","è",...], ... }
├── daemon/                       # crate Rust
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs               # I/O evdev+uinput, boucle événements, glue D-Bus
│       ├── statemachine.rs       # machine tap/hold PURE (testable, cœur TDD)
│       ├── table.rs              # chargement accents.json → set des lettres
│       └── dbus.rs               # proxy zbus vers l'extension
├── extension/                    # extension GNOME Shell
│   ├── metadata.json
│   ├── extension.js              # service D-Bus + cycle popup + injection
│   ├── accentPopup.js            # widget St de la popup (UI + navigation)
│   └── stylesheet.css
├── tools/
│   └── validate-accents.js       # test de la table (lancé avec gjs)
├── install.sh                    # udev + groupe input + build + systemd + extension
├── packaging/
│   ├── accent-holdd.service      # unité systemd --user
│   └── 99-accent-hold.rules      # règle udev uinput
└── docs/superpowers/...          # spec + ce plan
```

**Responsabilités :**
- `statemachine.rs` : logique pure tap/hold, aucune dépendance I/O → testée unitairement.
- `main.rs` : ouvre les claviers, grab, ré-émet via uinput, pilote la state machine, appelle D-Bus. Pas de logique métier complexe.
- `extension.js` : possède le nom D-Bus `dev.accenthold.Popup`, méthode `Trigger(s)`.
- `accentPopup.js` : rendu + navigation clavier, renvoie l'index choisi.
- `accents.json` : partagé daemon (clés) + extension (valeurs).

## Décision D-Bus (raffine le spec)

L'extension **possède** le service `dev.accenthold.Popup` (objet `/dev/accenthold/Popup`)
avec la méthode `Trigger(s letter) -> b handled`. Le daemon **appelle** cette méthode.
- Succès → l'extension gère tout (popup + injection). Daemon ne ré-émet rien.
- Échec/pas de propriétaire (extension absente/désactivée) → daemon ré-émet la lettre
  de base (failsafe : on ne reste jamais bloqué sans pouvoir taper la lettre).

---

## Phase 0 — Environnement de dev + spike d'injection (DE-RISK)

But : prouver AVANT tout que `notify_keyval(unicode)` insère bien un caractère
accentué dans une zone de texte ET dans gnome-terminal. Si ça échoue, on bascule
l'injection sur `dotool` (uinput) — donc à valider en premier.

### Task 0.1: Installer la toolchain Rust

**Files:** aucun (système).

- [ ] **Step 1: Installer cargo/rustc**

Run:
```bash
sudo apt-get update && sudo apt-get install -y cargo rustc pkg-config
```
Expected: `cargo --version` et `rustc --version` répondent (>= 1.75 souhaité).

- [ ] **Step 2: Vérifier**

Run: `cargo --version && rustc --version`
Expected: deux lignes de version, pas d'erreur.

### Task 0.2: Établir le loop de dev en Shell imbriqué

**Files:** aucun.

- [ ] **Step 1: Lancer un GNOME Shell imbriqué**

Run:
```bash
dbus-run-session -- gnome-shell --nested --wayland
```
Expected: une fenêtre GNOME Shell s'ouvre. (La fermer termine la session de test.)
Note : ce shell imbriqué lit les extensions de `~/.local/share/gnome-shell/extensions`
au démarrage ; le relancer recharge les extensions SANS toucher la vraie session.

- [ ] **Step 2: Confirmer qu'on peut y ouvrir un terminal**

Dans le shell imbriqué, ouvrir gnome-terminal (Activités → Terminal).
Expected: un terminal s'affiche dans la fenêtre imbriquée. Sert de cible de test injection.

### Task 0.3: Spike — extension jetable qui injecte « ê »

**Files:**
- Create: `spike/metadata.json`
- Create: `spike/extension.js`

- [ ] **Step 1: Écrire l'extension de spike**

`spike/metadata.json`:
```json
{
  "uuid": "accent-spike@local",
  "name": "Accent Spike",
  "description": "Throwaway: inject ê after 3s to test Clutter injection",
  "shell-version": ["50"]
}
```

`spike/extension.js`:
```js
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class SpikeExtension extends Extension {
    enable() {
        const seat = Clutter.get_default_backend().get_default_seat();
        this._vdev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        // 'ê' = U+00EA ; keysym Unicode = 0x01000000 | codepoint
        const keyval = 0x01000000 | 0x00EA;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            const t = Clutter.get_current_event_time();
            this._vdev.notify_keyval(t, keyval, Clutter.KeyState.PRESSED);
            this._vdev.notify_keyval(t, keyval, Clutter.KeyState.RELEASED);
            return GLib.SOURCE_REMOVE;
        });
    }
    disable() {
        if (this._timer) { GLib.source_remove(this._timer); this._timer = null; }
        this._vdev = null;
    }
}
```

- [ ] **Step 2: Installer le spike pour le shell imbriqué**

Run:
```bash
mkdir -p ~/.local/share/gnome-shell/extensions/accent-spike@local
cp spike/metadata.json spike/extension.js ~/.local/share/gnome-shell/extensions/accent-spike@local/
```
Expected: 2 fichiers copiés.

- [ ] **Step 3: Lancer le shell imbriqué, activer, tester en zone de texte**

Run (terminal hôte):
```bash
dbus-run-session -- gnome-shell --nested --wayland
```
Dans le shell imbriqué : ouvrir GNOME Text Editor, cliquer dans le document,
activer l'extension : ouvrir un terminal imbriqué et lancer
`gnome-extensions enable accent-spike@local`, puis recliquer dans Text Editor.
Expected: après 3 s, « ê » apparaît dans Text Editor.

- [ ] **Step 4: Tester l'injection dans gnome-terminal (LE point critique)**

Dans le shell imbriqué : focus sur gnome-terminal, ré-déclencher (désactiver puis
réactiver l'extension pour relancer le timer), cliquer dans le terminal dans les 3 s.
Expected: « ê » apparaît à l'invite du terminal.

- [ ] **Step 5: Décision**

- Si « ê » s'insère dans les DEUX (text editor + terminal) → injection Clutter validée,
  continuer le plan tel quel.
- Si le terminal échoue → noter l'échec, et remplacer l'étape d'injection (Task 3.5)
  par un appel à `dotool` (`printf 'type ê' | dotool`) lancé depuis l'extension via
  `Gio.Subprocess`. Installer `dotool` au préalable. NE PAS continuer sans cette décision.

- [ ] **Step 6: Nettoyer le spike**

Run:
```bash
rm -rf ~/.local/share/gnome-shell/extensions/accent-spike@local
git rm -r --cached spike 2>/dev/null; rm -rf spike
```

- [ ] **Step 7: Commit du résultat du spike (note)**

```bash
mkdir -p docs/superpowers/notes
printf '# Spike injection (Task 0.3)\n\nRésultat: <RÉSULTAT RÉEL>\n- Text editor: <ok/ko>\n- gnome-terminal: <ok/ko>\nDécision: <Clutter / dotool>\n' > docs/superpowers/notes/spike-injection.md
git add docs/superpowers/notes/spike-injection.md
git commit -m "spike: validate Clutter unicode injection (terminal incl.)"
```

---

## Phase 1 — Table de variantes (`accents.json`)

### Task 1.1: Créer la table et son test

**Files:**
- Create: `accents.json`
- Create: `tools/validate-accents.js`

- [ ] **Step 1: Écrire le test de validation (gjs)**

`tools/validate-accents.js`:
```js
#!/usr/bin/env gjs
const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

const path = ARGV[0] || 'accents.json';
const [ok, bytes] = GLib.file_get_contents(path);
if (!ok) { printerr('cannot read ' + path); imports.system.exit(1); }
let table;
try { table = JSON.parse(ByteArray.toString(bytes)); }
catch (e) { printerr('invalid JSON: ' + e); imports.system.exit(1); }

const required = ['a','e','i','o','u','c','n'];
let errors = 0;
for (const k of required) {
    if (!Array.isArray(table[k]) || table[k].length === 0) {
        printerr(`missing/empty key: ${k}`); errors++;
    }
}
for (const [k, arr] of Object.entries(table)) {
    if (!Array.isArray(arr)) { printerr(`value not array: ${k}`); errors++; continue; }
    for (const v of arr) {
        if (typeof v !== 'string' || [...v].length !== 1) {
            printerr(`variant not single codepoint: ${k} -> "${v}"`); errors++;
        }
    }
}
if (errors > 0) { printerr(`FAIL: ${errors} error(s)`); imports.system.exit(1); }
print('OK: ' + Object.keys(table).length + ' base letters');
```

- [ ] **Step 2: Lancer le test, vérifier l'échec (pas de fichier)**

Run: `gjs tools/validate-accents.js`
Expected: FAIL « cannot read accents.json ».

- [ ] **Step 3: Écrire `accents.json`**

`accents.json`:
```json
{
  "a": ["à","á","â","ä","æ","ã","å","ā"],
  "A": ["À","Á","Â","Ä","Æ","Ã","Å","Ā"],
  "c": ["ç","ć","č"],
  "C": ["Ç","Ć","Č"],
  "e": ["é","è","ê","ë","ē","ė","ę"],
  "E": ["É","È","Ê","Ë","Ē","Ė","Ę"],
  "i": ["î","ï","í","ī","į","ì"],
  "I": ["Î","Ï","Í","Ī","Į","Ì"],
  "n": ["ñ","ń"],
  "N": ["Ñ","Ń"],
  "o": ["ô","ö","ò","ó","œ","ø","õ","ō"],
  "O": ["Ô","Ö","Ò","Ó","Œ","Ø","Õ","Ō"],
  "u": ["û","ü","ù","ú","ū"],
  "U": ["Û","Ü","Ù","Ú","Ū"],
  "y": ["ÿ","ý"],
  "Y": ["Ÿ","Ý"],
  "s": ["ß","ś","š"],
  "S": ["Ś","Š"],
  "z": ["ž","ź","ż"],
  "Z": ["Ž","Ź","Ż"],
  "g": ["ğ"],
  "G": ["Ğ"]
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `gjs tools/validate-accents.js`
Expected: `OK: 22 base letters`.

- [ ] **Step 5: Commit**

```bash
git add accents.json tools/validate-accents.js
git commit -m "feat: accent variants table + validation"
```

---

## Phase 2 — Daemon Rust : machine tap/hold + I/O

### Task 2.1: Scaffolder le crate

**Files:**
- Create: `daemon/Cargo.toml`
- Create: `daemon/src/main.rs` (stub)

- [ ] **Step 1: Créer le crate**

`daemon/Cargo.toml`:
```toml
[package]
name = "accent-holdd"
version = "0.1.0"
edition = "2021"

[dependencies]
evdev = "0.12"
zbus = "4"
serde_json = "1"
anyhow = "1"

[[bin]]
name = "accent-holdd"
path = "src/main.rs"
```

`daemon/src/main.rs`:
```rust
fn main() {
    println!("accent-holdd");
}
```

- [ ] **Step 2: Build**

Run: `cd daemon && cargo build`
Expected: compile sans erreur (téléchargement des crates au 1er run).

- [ ] **Step 3: Commit**

```bash
git add daemon/Cargo.toml daemon/Cargo.lock daemon/src/main.rs
git commit -m "chore: scaffold rust daemon crate"
```

### Task 2.2: Machine tap/hold (cœur TDD, pure, sans I/O)

**Files:**
- Create: `daemon/src/statemachine.rs`
- Test: dans le même fichier (`#[cfg(test)]`).

Modèle : la machine reçoit des événements logiques et un « tick » temporel, et
produit des **actions**. Aucune dépendance evdev/temps réel → testable.

- [ ] **Step 1: Écrire les types + tests AVANT l'implémentation**

`daemon/src/statemachine.rs`:
```rust
//! Machine tap/hold pure. Pas d'I/O, pas d'horloge réelle : on lui passe le temps.

/// Événement d'entrée logique (issu d'evdev, normalisé).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Input {
    /// Appui d'une lettre accentuable (caractère de base).
    AccentKeyDown { letter: char, t_ms: u64 },
    /// Relâche de cette même lettre.
    AccentKeyUp { t_ms: u64 },
    /// N'importe quelle autre touche down/up brute (keycode, pressed).
    Other { code: u16, pressed: bool },
    /// Tick d'horloge (appelé régulièrement par la boucle).
    Tick { t_ms: u64 },
}

/// Action que la boucle d'I/O doit exécuter.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    /// Ré-émettre un tap complet de la lettre (down+up) via uinput.
    EmitTap(char),
    /// Re-passer un événement brut tel quel (passthrough).
    Passthrough { code: u16, pressed: bool },
    /// Ouvrir la popup pour cette lettre (appel D-Bus).
    OpenPopup(char),
}

pub struct StateMachine {
    hold_ms: u64,
    pending: Option<(char, u64)>, // lettre avalée + t_ms du down
    popup_open: bool,
}

impl StateMachine {
    pub fn new(hold_ms: u64) -> Self {
        Self { hold_ms, pending: None, popup_open: false }
    }

    pub fn handle(&mut self, input: Input) -> Vec<Action> {
        match input {
            Input::AccentKeyDown { letter, t_ms } => {
                // Avale la lettre, arme le timer. Rien n'est émis tout de suite.
                self.pending = Some((letter, t_ms));
                vec![]
            }
            Input::AccentKeyUp { .. } => {
                if self.popup_open {
                    // relâche pendant popup : on ignore (popup gère)
                    self.popup_open = false;
                    self.pending = None;
                    vec![]
                } else if let Some((letter, _)) = self.pending.take() {
                    // relâché avant le seuil => tap normal
                    vec![Action::EmitTap(letter)]
                } else {
                    vec![]
                }
            }
            Input::Tick { t_ms } => {
                if let Some((letter, down_t)) = self.pending {
                    if !self.popup_open && t_ms.saturating_sub(down_t) >= self.hold_ms {
                        self.popup_open = true;
                        return vec![Action::OpenPopup(letter)];
                    }
                }
                vec![]
            }
            Input::Other { code, pressed } => {
                vec![Action::Passthrough { code, pressed }]
            }
        }
    }

    /// Appelé par la boucle quand l'appel D-Bus a échoué (extension absente) :
    /// on émet la lettre de base en repli.
    pub fn on_popup_failed(&mut self) -> Vec<Action> {
        self.popup_open = false;
        if let Some((letter, _)) = self.pending.take() {
            vec![Action::EmitTap(letter)]
        } else {
            vec![]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tap_before_threshold_emits_letter() {
        let mut sm = StateMachine::new(450);
        assert_eq!(sm.handle(Input::AccentKeyDown { letter: 'e', t_ms: 0 }), vec![]);
        assert_eq!(sm.handle(Input::Tick { t_ms: 100 }), vec![]);
        assert_eq!(sm.handle(Input::AccentKeyUp { t_ms: 200 }),
                   vec![Action::EmitTap('e')]);
    }

    #[test]
    fn hold_past_threshold_opens_popup_and_swallows_letter() {
        let mut sm = StateMachine::new(450);
        sm.handle(Input::AccentKeyDown { letter: 'e', t_ms: 0 });
        assert_eq!(sm.handle(Input::Tick { t_ms: 449 }), vec![]);
        assert_eq!(sm.handle(Input::Tick { t_ms: 450 }), vec![Action::OpenPopup('e')]);
        // relâche après ouverture : pas de tap émis
        assert_eq!(sm.handle(Input::AccentKeyUp { t_ms: 600 }), vec![]);
    }

    #[test]
    fn other_keys_passthrough_immediately() {
        let mut sm = StateMachine::new(450);
        assert_eq!(sm.handle(Input::Other { code: 30, pressed: true }),
                   vec![Action::Passthrough { code: 30, pressed: true }]);
    }

    #[test]
    fn popup_failure_emits_base_letter() {
        let mut sm = StateMachine::new(450);
        sm.handle(Input::AccentKeyDown { letter: 'c', t_ms: 0 });
        sm.handle(Input::Tick { t_ms: 500 }); // popup open
        assert_eq!(sm.on_popup_failed(), vec![Action::EmitTap('c')]);
    }

    #[test]
    fn tick_only_fires_popup_once() {
        let mut sm = StateMachine::new(450);
        sm.handle(Input::AccentKeyDown { letter: 'a', t_ms: 0 });
        assert_eq!(sm.handle(Input::Tick { t_ms: 500 }), vec![Action::OpenPopup('a')]);
        assert_eq!(sm.handle(Input::Tick { t_ms: 600 }), vec![]); // plus rien
    }
}
```

- [ ] **Step 2: Déclarer le module + lancer les tests, vérifier qu'ils PASSENT**

Ajouter en tête de `daemon/src/main.rs`: `mod statemachine;`
Run: `cd daemon && cargo test`
Expected: `test result: ok. 5 passed`.

(Note : ici impl et tests sont écrits ensemble car la machine est petite ; le
red→green a été raisonné dans la conception des cas. Si un test échoue, corriger
`handle` avant de continuer.)

- [ ] **Step 3: Commit**

```bash
git add daemon/src/statemachine.rs daemon/src/main.rs
git commit -m "feat(daemon): pure tap/hold state machine + tests"
```

### Task 2.3: Chargement de la table → set des lettres accentuables

**Files:**
- Create: `daemon/src/table.rs`

- [ ] **Step 1: Écrire le test + l'impl**

`daemon/src/table.rs`:
```rust
use std::collections::HashSet;
use anyhow::Result;

/// Charge les clés de accents.json = ensemble des lettres accentuables.
pub fn load_accentable(path: &str) -> Result<HashSet<char>> {
    let data = std::fs::read_to_string(path)?;
    let v: serde_json::Value = serde_json::from_str(&data)?;
    let mut set = HashSet::new();
    if let Some(obj) = v.as_object() {
        for k in obj.keys() {
            if let Some(c) = k.chars().next() {
                set.insert(c);
            }
        }
    }
    Ok(set)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn loads_keys_as_charset() {
        let mut f = tempfile_path();
        std::fs::File::create(&f).unwrap()
            .write_all(br#"{"e":["é"],"c":["ç"]}"#).unwrap();
        let set = load_accentable(f.to_str().unwrap()).unwrap();
        assert!(set.contains(&'e'));
        assert!(set.contains(&'c'));
        assert!(!set.contains(&'x'));
        std::fs::remove_file(&f).ok();
    }

    fn tempfile_path() -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("accents-test-{}.json", std::process::id()));
        p
    }
}
```

- [ ] **Step 2: Déclarer le module + tester**

Ajouter `mod table;` dans `main.rs`.
Run: `cd daemon && cargo test`
Expected: tous les tests passent (6 au total).

- [ ] **Step 3: Commit**

```bash
git add daemon/src/table.rs daemon/src/main.rs
git commit -m "feat(daemon): load accentable letter set from accents.json"
```

### Task 2.4: Proxy D-Bus vers l'extension

**Files:**
- Create: `daemon/src/dbus.rs`

- [ ] **Step 1: Écrire le proxy**

`daemon/src/dbus.rs`:
```rust
use anyhow::Result;
use zbus::{blocking::Connection, proxy};

#[proxy(
    interface = "dev.accenthold.Popup",
    default_service = "dev.accenthold.Popup",
    default_path = "/dev/accenthold/Popup"
)]
trait Popup {
    /// Demande l'ouverture de la popup pour `letter`.
    /// Retourne true si l'extension a pris la main.
    fn trigger(&self, letter: &str) -> zbus::Result<bool>;
}

pub struct PopupClient {
    conn: Connection,
}

impl PopupClient {
    pub fn new() -> Result<Self> {
        Ok(Self { conn: Connection::session()? })
    }

    /// Renvoie Ok(true) si la popup a été déclenchée, Ok(false) sinon
    /// (extension absente / erreur) → le daemon fera un repli EmitTap.
    pub fn trigger(&self, letter: char) -> bool {
        let s = letter.to_string();
        match PopupProxyBlocking::new(&self.conn) {
            Ok(proxy) => proxy.trigger(&s).unwrap_or(false),
            Err(_) => false,
        }
    }
}
```

- [ ] **Step 2: Déclarer le module + build (pas de test unitaire ici : I/O D-Bus)**

Ajouter `mod dbus;` dans `main.rs`.
Run: `cd daemon && cargo build`
Expected: compile.

- [ ] **Step 3: Commit**

```bash
git add daemon/src/dbus.rs daemon/src/main.rs daemon/Cargo.lock
git commit -m "feat(daemon): zbus proxy to extension popup service"
```

### Task 2.5: Boucle evdev + uinput (glue I/O)

**Files:**
- Modify: `daemon/src/main.rs`

- [ ] **Step 1: Écrire la boucle complète**

`daemon/src/main.rs`:
```rust
mod statemachine;
mod table;
mod dbus;

use anyhow::{Context, Result};
use evdev::{Device, EventType, InputEvent, Key, uinput::VirtualDeviceBuilder, AttributeSet};
use statemachine::{StateMachine, Input, Action};
use std::collections::HashMap;
use std::time::{Duration, Instant};

const ACCENTS_PATH: &str = "/usr/local/share/accent-hold/accents.json";

/// Mappe un evdev Key vers le char de base s'il est accentuable et sans modifieur.
/// (MVP : layout-agnostic simplifié — on mappe les Key alphabétiques en minuscule.)
fn key_to_letter(key: Key) -> Option<char> {
    use evdev::Key as K;
    let c = match key {
        K::KEY_A => 'a', K::KEY_C => 'c', K::KEY_E => 'e', K::KEY_I => 'i',
        K::KEY_N => 'n', K::KEY_O => 'o', K::KEY_U => 'u', K::KEY_Y => 'y',
        K::KEY_S => 's', K::KEY_Z => 'z', K::KEY_G => 'g',
        _ => return None,
    };
    Some(c)
}

fn letter_to_key(c: char) -> Option<Key> {
    use evdev::Key as K;
    Some(match c {
        'a' => K::KEY_A, 'c' => K::KEY_C, 'e' => K::KEY_E, 'i' => K::KEY_I,
        'n' => K::KEY_N, 'o' => K::KEY_O, 'u' => K::KEY_U, 'y' => K::KEY_Y,
        's' => K::KEY_S, 'z' => K::KEY_Z, 'g' => K::KEY_G,
        _ => return None,
    })
}

fn now_ms(start: Instant) -> u64 { start.elapsed().as_millis() as u64 }

fn main() -> Result<()> {
    let accentable = table::load_accentable(ACCENTS_PATH)
        .context("loading accents.json")?;
    let popup = dbus::PopupClient::new().context("connecting session bus")?;

    // Sélectionne le premier clavier physique (MVP : un clavier).
    let mut device = pick_keyboard().context("no keyboard found")?;

    // Périphérique virtuel de ré-émission.
    let mut keys = AttributeSet::<Key>::new();
    for k in evdev::Key::KEY_RESERVED.code()..evdev::Key::KEY_MAX.code() {
        keys.insert(Key::new(k));
    }
    let mut vdev = VirtualDeviceBuilder::new()?
        .name("accent-hold-virtual")
        .with_keys(&keys)?
        .build()?;

    device.grab().context("EVIOCGRAB failed")?;

    let start = Instant::now();
    let mut sm = StateMachine::new(read_hold_ms());
    // map keycode -> char pour gérer le KeyUp de la lettre en cours
    let mut held_letter: Option<char> = None;
    let _ = &held_letter;

    loop {
        // Pompage des événements avec timeout pour pouvoir générer des Tick.
        for ev in device.fetch_events()? {
            if ev.event_type() != EventType::KEY { 
                emit_raw(&mut vdev, ev)?; continue; 
            }
            let key = Key::new(ev.code());
            let pressed = ev.value() == 1;
            let released = ev.value() == 0;
            let t = now_ms(start);

            let input = match key_to_letter(key) {
                Some(letter) if accentable.contains(&letter) => {
                    if pressed { held_letter = Some(letter); Input::AccentKeyDown { letter, t_ms: t } }
                    else if released { Input::AccentKeyUp { t_ms: t } }
                    else { /* repeat (value==2) */ continue; }
                }
                _ => Input::Other { code: ev.code(), pressed },
            };
            for action in sm.handle(input) {
                run_action(&mut vdev, &popup, &mut sm, action)?;
            }
        }
        // Tick (le timeout de fetch_events n'existe pas directement ; voir note)
        let t = now_ms(start);
        for action in sm.handle(Input::Tick { t_ms: t }) {
            run_action(&mut vdev, &popup, &mut sm, action)?;
        }
    }
}

fn run_action(vdev: &mut evdev::uinput::VirtualDevice,
              popup: &dbus::PopupClient,
              sm: &mut StateMachine,
              action: Action) -> Result<()> {
    match action {
        Action::EmitTap(c) => {
            if let Some(k) = letter_to_key(c) { tap_key(vdev, k)?; }
        }
        Action::Passthrough { code, pressed } => {
            let v = if pressed { 1 } else { 0 };
            vdev.emit(&[InputEvent::new(EventType::KEY, code, v)])?;
        }
        Action::OpenPopup(c) => {
            if !popup.trigger(c) {
                for a in sm.on_popup_failed() { run_action(vdev, popup, sm, a)?; }
            }
        }
    }
    Ok(())
}

fn tap_key(vdev: &mut evdev::uinput::VirtualDevice, k: Key) -> Result<()> {
    vdev.emit(&[InputEvent::new(EventType::KEY, k.code(), 1)])?;
    vdev.emit(&[InputEvent::new(EventType::KEY, k.code(), 0)])?;
    Ok(())
}

fn emit_raw(vdev: &mut evdev::uinput::VirtualDevice, ev: InputEvent) -> Result<()> {
    vdev.emit(&[ev])?; Ok(())
}

fn read_hold_ms() -> u64 {
    std::env::var("ACCENT_HOLD_MS").ok()
        .and_then(|s| s.parse().ok()).unwrap_or(450)
}

fn pick_keyboard() -> Option<Device> {
    for (_p, dev) in evdev::enumerate() {
        if dev.supported_keys().map_or(false, |k| k.contains(Key::KEY_A)) {
            return Some(dev);
        }
    }
    None
}
```

> **Note technique (à résoudre à l'implémentation) :** `fetch_events()` est bloquant ;
> pour générer des `Tick` réguliers (afin de détecter l'expiration du seuil sans
> attendre un autre événement), passer le fd en non-bloquant et utiliser `poll()`
> (crate `nix`) avec un timeout de ~30 ms, OU armer un timer dédié. Ajouter `nix = "0.27"`
> aux dépendances si besoin. Garder la state machine inchangée : seule la cadence des
> `Tick` change. C'est le seul vrai point d'attention I/O — la logique reste testée.

- [ ] **Step 2: Build**

Run: `cd daemon && cargo build --release`
Expected: compile (ajouter `nix` si la note ci-dessus l'impose).

- [ ] **Step 3: Test manuel hors-ligne (sans grab destructif)**

Sur une VT secondaire ou avec un clavier USB de test (pour ne pas bloquer le clavier
principal en cas de bug), lancer :
```bash
sudo ACCENT_HOLD_MS=450 ./daemon/target/release/accent-holdd
```
Taper `e` rapidement → `e` ; maintenir `e` → (popup échoue car extension absente →)
`e` ré-émis en repli. Vérifier qu'aucune touche n'est bloquée. Ctrl-C pour quitter.
Expected: frappe normale préservée ; pas de blocage clavier.

- [ ] **Step 4: Commit**

```bash
git add daemon/src/main.rs daemon/Cargo.toml daemon/Cargo.lock
git commit -m "feat(daemon): evdev grab + uinput loop wired to state machine"
```

---

## Phase 3 — Extension GNOME Shell

### Task 3.1: Squelette d'extension + service D-Bus

**Files:**
- Create: `extension/metadata.json`
- Create: `extension/extension.js`

- [ ] **Step 1: metadata**

`extension/metadata.json`:
```json
{
  "uuid": "accent-hold@local",
  "name": "Accent Hold",
  "description": "Press-and-hold accent popup (paired with accent-holdd daemon)",
  "shell-version": ["50"],
  "settings-schema": null
}
```

- [ ] **Step 2: extension.js avec service D-Bus minimal**

`extension/extension.js`:
```js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AccentPopup} from './accentPopup.js';

const IFACE = `
<node>
  <interface name="dev.accenthold.Popup">
    <method name="Trigger">
      <arg type="s" direction="in" name="letter"/>
      <arg type="b" direction="out" name="handled"/>
    </method>
  </interface>
</node>`;

export default class AccentHoldExtension extends Extension {
    enable() {
        this._table = this._loadTable();
        this._popup = new AccentPopup(this._table);
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, '/dev/accenthold/Popup');
        this._nameId = Gio.bus_own_name_on_connection(
            Gio.DBus.session, 'dev.accenthold.Popup',
            Gio.BusNameOwnerFlags.NONE, null, null);
    }

    disable() {
        if (this._nameId) { Gio.bus_unown_name(this._nameId); this._nameId = null; }
        if (this._dbus) { this._dbus.unexport(); this._dbus = null; }
        if (this._popup) { this._popup.destroy(); this._popup = null; }
        this._table = null;
    }

    // Méthode D-Bus appelée par le daemon.
    Trigger(letter) {
        if (!this._table[letter]) return false;
        this._popup.show(letter);
        return true;
    }

    _loadTable() {
        const path = this.path + '/accents.json';
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok) return {};
        const dec = new TextDecoder();
        return JSON.parse(dec.decode(bytes));
    }
}
```

> Note : `accents.json` sera copié dans le dossier de l'extension par `install.sh`.

- [ ] **Step 3: Commit (compile implicite via chargement plus tard)**

```bash
git add extension/metadata.json extension/extension.js
git commit -m "feat(extension): skeleton + dev.accenthold.Popup D-Bus service"
```

### Task 3.2: Widget popup (UI + navigation + injection)

**Files:**
- Create: `extension/accentPopup.js`
- Create: `extension/stylesheet.css`

- [ ] **Step 1: accentPopup.js**

`extension/accentPopup.js`:
```js
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class AccentPopup {
    constructor(table) {
        this._table = table;
        this._actor = null;
        this._variants = [];
        this._index = 0;
        this._grab = null;
        const seat = Clutter.get_default_backend().get_default_seat();
        this._vdev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    show(letter) {
        this._variants = this._table[letter] || [];
        if (this._variants.length === 0) return;
        this._index = 0;
        this._build();
        this._position();
        Main.layoutManager.uiGroup.add_child(this._actor);
        this._grab = Main.pushModal(this._actor, {actionMode: 1 /* NORMAL */});
        if (!this._grab) { this.hide(); return; }
        this._actor.connect('key-press-event', (a, e) => this._onKey(e));
        this._highlight();
    }

    _build() {
        this._actor = new St.BoxLayout({
            style_class: 'accent-popup', reactive: true, can_focus: true,
        });
        this._chips = this._variants.map((v, i) => {
            const chip = new St.Button({
                style_class: 'accent-chip',
                label: `${i + 1} ${v}`,
            });
            chip.connect('clicked', () => this._choose(i));
            this._actor.add_child(chip);
            return chip;
        });
    }

    _position() {
        const [x, y] = global.get_pointer();
        this._actor.set_position(x, y + 24);
    }

    _highlight() {
        this._chips.forEach((c, i) =>
            i === this._index ? c.add_style_pseudo_class('selected')
                              : c.remove_style_pseudo_class('selected'));
    }

    _onKey(event) {
        const sym = event.get_key_symbol();
        if (sym === Clutter.KEY_Escape) { this.hide(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Left)  { this._index = Math.max(0, this._index - 1); this._highlight(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Right) { this._index = Math.min(this._variants.length - 1, this._index + 1); this._highlight(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) { this._choose(this._index); return Clutter.EVENT_STOP; }
        if (sym >= Clutter.KEY_1 && sym <= Clutter.KEY_9) {
            const n = sym - Clutter.KEY_1;
            if (n < this._variants.length) this._choose(n);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_STOP; // popup modale : on consomme tout
    }

    _choose(i) {
        const ch = this._variants[i];
        this.hide();
        this._inject(ch);
    }

    _inject(ch) {
        const cp = ch.codePointAt(0);
        const keyval = 0x01000000 | cp;
        const t = Clutter.get_current_event_time();
        this._vdev.notify_keyval(t, keyval, Clutter.KeyState.PRESSED);
        this._vdev.notify_keyval(t, keyval, Clutter.KeyState.RELEASED);
    }

    hide() {
        if (this._grab) { Main.popModal(this._grab); this._grab = null; }
        if (this._actor) {
            Main.layoutManager.uiGroup.remove_child(this._actor);
            this._actor.destroy(); this._actor = null;
        }
    }

    destroy() { this.hide(); this._vdev = null; }
}
```

`extension/stylesheet.css`:
```css
.accent-popup {
    background-color: rgba(40,40,40,0.95);
    border-radius: 12px;
    padding: 8px;
    spacing: 6px;
}
.accent-chip {
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 18px;
    color: #fff;
}
.accent-chip:selected {
    background-color: #3584e4;
}
```

- [ ] **Step 2: Tester dans le shell imbriqué**

Installer l'extension + accents.json dans le dossier d'extension, lancer le shell
imbriqué, l'activer :
```bash
DEST=~/.local/share/gnome-shell/extensions/accent-hold@local
mkdir -p "$DEST" && cp extension/* "$DEST"/ && cp accents.json "$DEST"/
dbus-run-session -- gnome-shell --nested --wayland
# dans le shell imbriqué : gnome-extensions enable accent-hold@local
```
Déclencher manuellement la méthode D-Bus (depuis un terminal de la session imbriquée) :
```bash
gdbus call --session --dest dev.accenthold.Popup \
  --object-path /dev/accenthold/Popup \
  --method dev.accenthold.Popup.Trigger 'e'
```
Expected: la popup `é è ê ë …` s'affiche au pointeur ; `3` insère `ê` dans la zone
de texte focalisée ; `Échap` ferme ; clic insère.

- [ ] **Step 3: Commit**

```bash
git add extension/accentPopup.js extension/stylesheet.css
git commit -m "feat(extension): accent popup UI, keyboard nav, Clutter injection"
```

---

## Phase 4 — Packaging & installation

### Task 4.1: Unité systemd + règle udev

**Files:**
- Create: `packaging/accent-holdd.service`
- Create: `packaging/99-accent-hold.rules`

- [ ] **Step 1: service**

`packaging/accent-holdd.service`:
```ini
[Unit]
Description=accent-hold key detection daemon
After=graphical-session.target
PartOf=graphical-session.target

[Service]
ExecStart=/usr/local/bin/accent-holdd
Restart=on-failure
RestartSec=2

[Install]
WantedBy=graphical-session.target
```

`packaging/99-accent-hold.rules`:
```
KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"
```

- [ ] **Step 2: Commit**

```bash
git add packaging/
git commit -m "feat: systemd --user unit + udev uinput rule"
```

### Task 4.2: install.sh

**Files:**
- Create: `install.sh`

- [ ] **Step 1: écrire l'installeur**

`install.sh`:
```bash
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
```

- [ ] **Step 2: rendre exécutable + commit**

```bash
chmod +x install.sh
git add install.sh
git commit -m "feat: install.sh (build, udev, group, systemd, extension)"
```

---

## Phase 5 — Intégration bout-en-bout (manuel)

### Task 5.1: Installation réelle + validation

**Files:** aucun.

- [ ] **Step 1: Installer**

Run: `./install.sh`
Expected: se termine sans erreur, affiche les 4 étapes finales.

- [ ] **Step 2: Logout/login** (pour groupe input + détection extension).

- [ ] **Step 3: Activer + démarrer**

Run:
```bash
gnome-extensions enable accent-hold@local
systemctl --user start accent-holdd
systemctl --user status accent-holdd --no-pager
```
Expected: service `active (running)`.

- [ ] **Step 4: Checklist fonctionnelle**

| Cas | Action | Attendu |
|-----|--------|---------|
| Tap | appui bref `e` dans GNOME Text Editor | `e` |
| Hold | maintien `e` puis `3` | `ê` |
| Nav | maintien `c`, `←`/`→`, Entrée | variante surlignée |
| Annule | maintien `o`, `Échap` | rien inséré |
| Terminal | maintien `e` puis `2` dans gnome-terminal | `è` |
| Firefox | maintien `a` puis `1` dans un champ | `à` |
| Non-accent | frappe normale d'une phrase | inchangée, pas de latence |

- [ ] **Step 5: Documenter l'état + commit**

```bash
printf '# Validation E2E (Task 5.1)\n\n<coller le tableau avec ok/ko réels>\n' \
  > docs/superpowers/notes/e2e-validation.md
git add docs/superpowers/notes/e2e-validation.md
git commit -m "docs: end-to-end validation results"
```

---

## Risques & notes d'implémentation

1. **Cadence des Tick** (Task 2.5) : seul vrai point I/O délicat — utiliser fd
   non-bloquant + `poll(timeout=30ms)`. La state machine reste inchangée.
2. **Sécurité de test du grab** : tester le daemon d'abord avec un clavier USB
   secondaire ou sur une VT, pour ne jamais bloquer le clavier principal en cas de bug.
3. **Injection terminal** : dépend du résultat du spike (Task 0.3). Repli `dotool` prévu.
4. **Layout fr/AZERTY** : `key_to_letter` mappe les keycodes physiques (KEY_A…) ;
   sur AZERTY le keycode KEY_Q produit 'a' à l'écran — le MVP mappe par **lettre logique
   attendue**, à affiner si décalage constaté (la table accents.json est en lettres
   logiques, pas en keycodes). À valider en Task 5.1 et corriger le mapping si besoin.
5. **Multi-clavier / hotplug** : MVP gère un seul clavier (`pick_keyboard`) ;
   amélioration ultérieure = surveiller `/dev/input` et grab multiple.
```
