# Promo — channels and ready-to-adapt copy (v2.1, October 2026)

Links:
- EGO: https://extensions.gnome.org/extension/10265/accent-hold/
- GitHub: https://github.com/d101c/accent-hold
- Release: https://github.com/d101c/accent-hold/releases/tag/v2.1
- Demo GIF: docs/demo.gif (still shows the Super+E shortcut; a new GIF of the
  hold gesture would help every post below)

## Read first: AI rules

Most of the code was written with an AI assistant (Claude), directed and
tested by the author. Several channels have rules about this:

| Channel | Rule |
|---|---|
| r/gnome | Removes posts announcing projects entirely written by an LLM. |
| GNOME Discourse | Same rule as r/gnome (policy of 2026-07-01). |
| This Week in GNOME | The submission message itself must not be LLM-written (translation and spell-check tools are fine). |
| LinuxLinks | AI-heavy projects must say publicly how AI was used and show human review, testing and maintenance. |
| OMG! Ubuntu | Has an AI policy page (linked from the tip page); read it before sending. |

So: say it openly (README + posts), and write the TWIG message yourself.
Copy below is a starting point to rewrite in your own words.

## Channels, by priority

| # | Where | How | Notes |
|---|---|---|---|
| 1 | This Week in GNOME | Matrix room `#thisweek:gnome.org`, mention TWIG-Bot | Weekly, Friday. EGO listing required (done). Own words only. |
| 2 | OMG! Ubuntu | Form: https://omgubuntu.co.uk/tip | No reply unless they need info. |
| 3 | It's FOSS News | Form: https://news.itsfoss.com/contact-us | Release announcements by developers accepted. |
| 4 | Linuxiac | bobby@linuxiac.com | Founder's address, from the About page. |
| 5 | 9to5Linux | Contact page on 9to5linux.com | Page was down when checked; find the address there. |
| 6 | LinuxLinks | Form: https://www.linuxlinks.com/suggest-open-source-program/ | Requires public AI disclosure. |
| 7 | LinuxFr.org (fr) | Journal (published at once) or dépêche: https://linuxfr.org/proposer-un-contenu | Dépêches are moderated. |
| 8 | Mastodon | Post with #GNOME #Linux | Large GNOME community. |
| 9 | Hacker News | Show HN | Readers ask about AI use; say it upfront. |
| 10 | AlternativeTo | Account › "Suggest new application" | Long free queue. |
| — | r/gnome, GNOME Discourse | — | Likely removed under the LLM rule; only if you judge the project is not "entirely" LLM-written, and say so. |

---

## Facts for the TWIG message (write it yourself)

- Accent Hold v2.1 on extensions.gnome.org, GNOME 45 to 50.
- Hold a letter, its accented variants appear next to the text cursor; pick by
  number (key position, so AZERTY/QWERTZ work), arrows + Enter, or mouse.
- A tap types normally; the held letter does not repeat.
- Pure extension: hooks the keys GNOME Shell's input method already sees, no
  IBus engine or daemon needed. Super+E shortcut for other apps.
- Idea credited to Manuele Conti's gnome-accent-hold.

---

## News tip (OMG! Ubuntu, It's FOSS, Linuxiac, 9to5Linux, LinuxLinks)

**Subject:** Accent Hold 2.1: macOS-style press and hold for accents on GNOME

Hi,

Accent Hold is a GNOME Shell extension (GNOME 45 to 50) that brings the macOS
press-and-hold gesture to GNOME: hold a letter and its accented variants
(é è ê ë, ç, ñ …) appear next to the text cursor; pick one by number, arrows or
mouse. A tap types the letter as usual. Version 2.1 does this in the extension
itself, so it is a one-click install from extensions.gnome.org, with no daemon,
no root and no input method to configure. It works on AZERTY and QWERTZ too.

- Install: https://extensions.gnome.org/extension/10265/accent-hold/
- Source (GPL-2.0-or-later): https://github.com/d101c/accent-hold

Transparency: I wrote it with the help of an AI coding assistant; I designed,
reviewed and tested it, and I maintain it.

Thanks for considering it!

---

## Mastodon

Accent Hold 2.1 is out: hold a letter on #GNOME and pick its accent, like on
macOS (é è ê ç ñ …). A tap types normally, the held key doesn't repeat, AZERTY
and QWERTZ work. One-click install, no daemon, no root.

https://extensions.gnome.org/extension/10265/accent-hold/

Built with an AI coding assistant, tested by hand.

#Linux #GNOMEShell #OpenSource

---

## Show HN

**Title:** Show HN: Accent Hold – macOS-style press and hold for accents on GNOME

**First comment:**
I wanted the macOS "hold a key, pick an accent" gesture on GNOME/Wayland.
An extension cannot see keys held in other apps, so the first versions used a
shortcut, then an IBus engine. Version 2.1 found a simpler path: GNOME Shell's
input method already receives every key typed into a text field before handing
it to IBus. The extension wraps that call, lets every key through, and only
keeps back digits/arrows/Enter while the variants are shown. The held letter's
repeats are swallowed, and the chosen variant replaces the letter already typed
(delete-surrounding + commit, or BackSpace in terminals).

Limits: apps that don't use the Wayland text-input protocol (old X11 apps,
some Electron builds) only get the Super+E shortcut.

I built it with an AI coding assistant and tested it by hand. Feedback on
layouts and apps welcome.

https://github.com/d101c/accent-hold

---

## LinuxFr.org (journal)

**Titre :** Accent Hold 2.1 : l'appui long façon macOS pour les accents sous GNOME

Accent Hold est une extension GNOME Shell (GNOME 45 à 50) : on maintient une
lettre et ses variantes accentuées (é è ê ë, ç, ñ…) s'affichent à côté du
curseur ; on choisit au chiffre, aux flèches ou à la souris. Une frappe normale
tape la lettre, la touche maintenue ne se répète pas, et ça marche en AZERTY.

La version 2.1 fait tout depuis l'extension : elle se branche sur la méthode
de saisie de GNOME Shell, qui voit déjà chaque touche tapée dans un champ
texte. Installation en un clic, ni démon ni root. Un raccourci (Super+E) reste
disponible pour les applications X11.

Transparence : je l'ai développée avec un assistant de code IA, en la
concevant, la relisant et la testant moi-même. Licence GPL-2.0-or-later.
L'idée de l'appui long vient de gnome-accent-hold de Manuele Conti.

- https://extensions.gnome.org/extension/10265/accent-hold/
- https://github.com/d101c/accent-hold
