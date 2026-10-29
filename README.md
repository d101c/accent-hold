# Accent Hold

*Read this in another language: [Français](README.fr.md)*

> **Type accented and special characters the macOS way: hold the letter.**
> Hold `e`, `a`, `c`, `o`, `n` … and its accented variants (`é è ê ë`, `ç`, `ñ`,
> `ô` …) appear next to the text cursor; tap a letter and it types normally.
> A shortcut (`Super+E`) does the same anywhere else. Pure GNOME Shell
> extension: no daemon, no privileges, no dependencies, one-click install from
> extensions.gnome.org.

![Accent Hold in action](docs/demo.gif)

## Usage

**Press and hold** (in text fields, editors, the terminal…):

1. hold a letter: `e`, `a`, `c`, `o`, `u`, `n`, `s`, `i`, `y`, `z`
2. pick the variant: `1`–`9` (by key position, so it works on AZERTY,
   QWERTZ …), or `←`/`→` + `Enter`, or click. `Esc` keeps the plain letter.

The held letter does not repeat. `E` (with Shift) offers `É È Ê Ë …`.

**Shortcut**, for applications that do not use the GNOME input method:

1. `Super+E` (configurable)
2. type a base letter
3. pick the variant the same way.

## Install

### For a user (the simplest way)
On [**extensions.gnome.org**](https://extensions.gnome.org/extension/10265/accent-hold/) (GNOME 45 to 50), click **“Install”**. Done. No terminal, no sudo,
no daemon — it is a pure Shell extension.

### Build the package to upload
```bash
./pack.sh
```
Produces `accent-hold@griffit.gmail.com.shell-extension.zip` at the repo root,
ready to be submitted at <https://extensions.gnome.org/upload/>.

### Locally (dev)
```bash
gnome-extensions install --force accent-hold@griffit.gmail.com.shell-extension.zip
# log out / log back in (Wayland), then:
gnome-extensions enable accent-hold@griffit.gmail.com
```

## Preferences

Built-in settings panel (the settings icon in the *Extensions* app, or
`gnome-extensions prefs accent-hold@griffit.gmail.com`):

- **Press and hold** — on/off, and how long a letter must be held (default 400 ms).
- **Shortcut** — the key that opens the picker (default `Super+E`).
- **Enable / disable** — turns the shortcut off without uninstalling the extension.
- **Delay (ms)** — latency before the popup appears (0–1000).
- **Characters** — table of accented variants (JSON), overridable.
- **Keyboards** — list of xkb layouts where the extension is active (empty = all).

Everything is stored in GSettings
(`org.gnome.shell.extensions.accent-hold`). From the CLI:
```bash
gsettings set org.gnome.shell.extensions.accent-hold trigger "['<Super>grave']"
```

## Optional IBus engine (X11 applications)

Press and hold works in every application using the GNOME input method
(GTK, most Qt apps, terminals). For older X11 applications, the
[`ibus/`](ibus/) engine offers the same gesture through IBus. Most people do
not need it.

```bash
curl -L https://github.com/d101c/accent-hold/archive/refs/tags/v2.0.tar.gz | tar xz
accent-hold-2.0/ibus/install.sh --replace
```
From a clone, run `./ibus/install.sh --replace` (or `--add-source`). It needs
the IBus Python bindings, already there on most GNOME desktops (otherwise
`sudo apt install python3-gi gir1.2-ibus-1.0`, or `sudo dnf install
python3-gobject ibus`).

No `sudo`. One input source is generated per keyboard layout you use
(“French (Accent Hold)”, “English (Accent Hold)”, …). While one of them is
selected, the extension leaves the keys to the engine. Remove it with
`./ibus/uninstall.sh`.

How it works: the installer adds a small xkb option (`accenthold:norepeat`,
files in `~/.config/xkb`) that marks only the accentable letters (a, e, i, o,
u, c, n, y, s, z on your layouts) as non-repeating, like macOS does. A held
letter types one character and opens the picker instead of `eeee`; arrows,
Delete, volume keys and every other key keep the desktop's native repeat,
everywhere. Re-run the installer after adding a layout.

The preferences (accent table, delay) open from GNOME's input source menu
(“fr” in the top bar) › *Accent Hold Preferences…*, so with the engine you can
hide the extension's own icon.

## How press and hold works

On Wayland, GNOME Shell's input method sees every key typed into a text
field before passing it to IBus. The extension watches those keys: a tapped
letter goes through untouched; a held accentable letter opens the variants,
its repeats are swallowed, and the chosen variant replaces the letter already
typed. Only digits, arrows, `Enter` and `Esc` are kept back while the variants
are shown. The old evdev daemon variant is archived in [`legacy/`](legacy/).

## Zero-install alternative: the Compose key

Without installing anything, GNOME can already type accents everywhere:
```bash
gsettings set org.gnome.desktop.input-sources xkb-options "['compose:caps']"
```
Then `Compose`(Caps Lock) `e` `'` → é. No popup, but zero dependencies.

## How it was made

Accent Hold was developed with substantial help from an AI coding assistant
(Claude, by Anthropic), which wrote most of the code. The author chose the
features and the approach, reviewed the changes, tested every version by hand
on GNOME 50 (AZERTY and QWERTY), and maintains the project. The press-and-hold
logic is covered by automated tests (`gjs -m extension/tests/holdMachine.test.js`,
`pytest ibus/tests`), and the extension was also tested in a headless GNOME
Shell with injected key presses. Bug reports are read and answered by a human.

## Credits

The press-and-hold technique (the held letter kept from repeating, letter
replaced after the fact) comes from **Manuele Conti**'s
[gnome-accent-hold](https://github.com/manux81/gnome-accent-hold). Thank you!
The extension and the IBus engine are independent implementations.

## License

[GPL-2.0-or-later](LICENSE).
