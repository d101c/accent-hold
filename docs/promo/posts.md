# Promo — ready-to-post copy

Links:
- EGO: https://extensions.gnome.org/extension/10265/accent-hold/
- GitHub: https://github.com/d101c/accent-hold
- Demo GIF: docs/demo.gif

> Tip: wait until the extension is **approved on EGO** before the big launches
> (Reddit / Hacker News), so the “Install” link works in one click. The GitHub
> repo + This Week in GNOME can go out anytime.

---

## Reddit — r/gnome (and r/linux)

**Title:** I made Accent Hold — a macOS-style accent picker for GNOME (no daemon, no root)

**Body:**
Typing accents on Linux always annoyed me, so I built a small GNOME Shell extension
that brings the macOS “press-and-hold” feel to GNOME:

- Press a shortcut (default **Super+E**), type a base letter (`e`, `a`, `c`, `o`, `n`…),
  then pick the accented variant (`é è ê ë`, `ç`, `ñ`, `ô`…) from a popup.
- The character is inserted **wherever your cursor is — text fields, editors and the
  terminal included**.
- **Pure Shell extension**: no daemon, no root, no dependencies. One-click install.
- Configurable shortcut, popup delay, character table and active keyboard layouts,
  plus a top-bar toggle. Works on **AZERTY** too (variant selection is layout-aware).

GIF + details: https://github.com/d101c/accent-hold
Install (once approved): https://extensions.gnome.org/extension/10265/accent-hold/

Feedback very welcome — especially on layouts/apps I should test.

---

## Mastodon / Fediverse (Fosstodon)

Just published **Accent Hold** 🎹 — a macOS-style accent picker for #GNOME.

Press a shortcut → type a letter → pick the variant (é è ê ç ñ ô…). Inserted
anywhere, terminal included. Pure Shell extension, no daemon, no root, one-click install.

⬇️ https://extensions.gnome.org/extension/10265/accent-hold/
⭐ https://github.com/d101c/accent-hold

#Linux #OpenSource #GNOMEShell

---

## Hacker News — Show HN

**Title:** Show HN: Accent Hold – macOS-style accent picker for GNOME

**Body (first comment):**
I wanted the macOS “hold a key → pick an accent” flow on GNOME/Wayland. The honest
constraint: truly intercepting a *held letter* in another app on Wayland needs
privileged input access (evdev daemon + udev + input group) — not something you can
ship in one click. So I made the pragmatic version: a shortcut opens a picker, you
type the base letter, then choose the variant. It’s a **pure GNOME Shell extension**
— no daemon, no root, no deps.

Two things that were fun to get right on GNOME 50 / mutter:
- Injection: `notify_keyval` with a Unicode keysym fails (“No keycode found”), because
  the char isn’t on the keymap. Solution: set the clipboard + synthesize Shift+Insert
  (real keysyms), which pastes into both GTK and VTE terminals.
- AZERTY: number-row keys produce `&é"'` without Shift, so I match variant selection by
  **hardware keycode** instead of keysym — layout-independent.

Repo: https://github.com/d101c/accent-hold
Install: https://extensions.gnome.org/extension/10265/accent-hold/

---

## This Week in GNOME (submit via #thisweek:gnome.org Matrix, or World/twig MR)

**Accent Hold** — a new extension that brings a macOS-style accent picker to GNOME.
Press a configurable shortcut, type a base letter, and pick the accented variant
(é è ê ç ñ ô …) from a popup; it’s inserted wherever your cursor is, terminal included.
Pure Shell extension (no daemon, no privileges), with a preferences panel and a
top-bar toggle. https://extensions.gnome.org/extension/10265/accent-hold/

---

## Blog tip (OMG! Ubuntu / It's FOSS / Linux Uprising — via their “submit a tip” forms)

**Subject:** New GNOME extension: macOS-style accent picker (no daemon, one-click)

Hi! I just released **Accent Hold**, a GNOME Shell extension that lets you type accented
characters the macOS way: a shortcut opens a popup of variants (é è ê ç ñ ô …) for the
letter you type, inserted anywhere including the terminal. It’s a pure Shell extension
— no daemon, no root — with a preferences panel, a top-bar toggle, i18n (EN/FR), and
AZERTY support.

- Install: https://extensions.gnome.org/extension/10265/accent-hold/
- Source + demo GIF: https://github.com/d101c/accent-hold

Happy to provide more screenshots or details. Thanks for considering it!
