# YouTube outreach — Accent Hold

Checked on 2026-11-05 by reading each channel's Videos and About tabs.
Send these yourself, in your own words if you prefer: the drafts below are a
starting point. Attach `docs/demo-hold.gif` (or link it from the README) and
keep the AI sentence: every one of these creators has covered the "AI slop"
debate this autumn, and a tip that hides it gets dropped.

Links to paste everywhere:

- EGO: https://extensions.gnome.org/extension/10265/accent-hold/
- Source: https://github.com/d101c/accent-hold
- GIF: https://raw.githubusercontent.com/d101c/accent-hold/master/docs/demo-hold.gif

## Who, verified

| # | Channel | Size | Why it fits (what they published lately) | How to reach |
|---|---|---|---|---|
| 1 | **The Linux Experiment** (@TheLinuxEXP, Nick) | 433K | Daily Linux News + weekly show; GNOME is his desktop; "16 cool new GNOME extensions & applications" (142K views). Lives in France: French is fine. | Business e-mail on the About tab ("view email address" button); Mastodon @thelinuxEXP@mastodon.social |
| 2 | **Linux Tex** (@LinuxTex) | 144K | "This GNOME Extension Completely Transforms the Linux Desktop!" 3 weeks ago; GNOME 51 and GNOME OS videos this month. Does single-extension videos. | Business e-mail on the About tab |
| 3 | **Michael Horn** (@MichaelNROH) | 100K | "GNOME 51 Review" 2 weeks ago; "The Best Gnome Extensions" is his biggest video (718K). Beginner-oriented, GNOME customisation. | Business e-mail on the About tab; Mastodon / X @MichaelNROH |
| 4 | **Adrien Linuxtricks** (@AdrienLinuxtricks) | 78K, FR | "GNOME 51 est là" tour 1 month ago; weekly live news "CKOIKIDI" (last one yesterday) where he reads viewer tips. The French channel for this. | Contact form on linuxtricks.fr; e-mail on the About tab |
| 5 | **Brodie Robertson** (@BrodieRobertson) | 125K | Daily commentary; picks up small projects and Wayland input topics ("Wayland Is Trying To Fix Remote Desktop Support", "A New Approach To An Ancient Linux Terminal Problem"). | Says "any social media": Mastodon, Matrix space, Discord (links on About) |
| 6 | **The Linux Cast** (@TheLinuxCast, Matt) | 75K | "Our favorite Rare Apps (2026 Edition)" 4 days ago; weekly podcast with app picks. | email@thelinuxcast.org (public on About) |
| 7 | **DistroTube** (@DistroTube, Derek) | 276K | Regular small-app spotlights (Mousam, Shelly, Vidman), but tiling-WM and terminal first, GNOME rarely. Low priority. | Mastodon @distrotube; contact on distrotube.com |

Checked and dropped: TechHut (home-server channel now), Veronica Explains
(a video every other month, retro/hardware), Chris Titus Tech (Windows
tooling and AI workflows), cocadmin (French DevOps, no desktop content).
Not checked: TuxDigital / This Week in Linux (page unreadable from the
browser; they take news tips at tuxdigital.com).

Order: 1, 2, 4 the same evening as the TWIG message; 3, 5, 6 two days later;
7 only if the first ones bite. One mail each, no follow-up before two weeks.

## Angle

"The macOS press-and-hold accent gesture, on GNOME, as a plain extension."
One sentence on what it does, one on why it was hard (Wayland hides held
keys from extensions; this hooks GNOME Shell's own input method instead),
one on how it was built. Nothing else. They decide in ten seconds and the GIF
does the work.

---

## 1. The Linux Experiment (e-mail, English; a French PS is fine)

**Subject:** Accent Hold: macOS press-and-hold accents on GNOME, as an extension

Hi Nick,

I made a GNOME extension you might find worth a mention: Accent Hold brings
the macOS gesture to GNOME. Hold `e`, a popup shows é è ê ë, pick one with
its number, the arrows or the mouse. A tap types `e` as usual. It works in
GTK apps, VTE terminals and Electron apps with the Wayland backend, on any
layout (AZERTY, QWERTZ, QWERTY), with no daemon and no root. One click on
extensions.gnome.org, GNOME 45 to 51.

Ten-second GIF: <link>
Extension: https://extensions.gnome.org/extension/10265/accent-hold/
Source (GPL): https://github.com/d101c/accent-hold

The interesting part, if you ever cover it: a Wayland extension cannot see a
key held in another window, so the first versions used a shortcut and then
an IBus engine. 2.1 found a simpler route: GNOME Shell's input method already
receives every key typed into a text field, so the extension wraps that
call, lets everything through, and only keeps the digits, arrows and Enter
back while the popup is open.

Full disclosure: I built it with an AI coding assistant, reviewing and
testing every piece by hand; EGO reviewed and approved it.

Thanks for the channel,
Julien

PS : je suis français aussi, si tu préfères échanger en français.

## 2. Linux Tex (e-mail)

**Subject:** A GNOME extension for a gesture Linux never had: hold a letter, pick its accent

Hi,

You did a video on a single GNOME extension three weeks ago, so here is one
that may deserve the same treatment. Accent Hold brings the macOS
press-and-hold accents to GNOME: hold `e`, a popup shows é è ê ë, pick one
with its number, the arrows or the mouse; a tap types `e` as usual. Works in
GTK apps, terminals and Wayland Electron apps, on any layout, with no daemon
and no root. One click on extensions.gnome.org, GNOME 45 to 51.

GIF: <link>
Extension: https://extensions.gnome.org/extension/10265/accent-hold/
Source: https://github.com/d101c/accent-hold

Built with an AI coding assistant, tested by hand, approved by the EGO
reviewers. Happy to answer anything.

Julien

## 3. Michael Horn (e-mail)

**Subject:** For your next GNOME extensions list: macOS-style accents

Hi Michael,

Your "Best Gnome Extensions" video is how a lot of people set up their
desktop, so here is a candidate for the next one. Accent Hold: hold a
letter, pick its accent from a popup, like on macOS. Tap types normally;
digits, arrows or the mouse pick; AZERTY and QWERTZ work. No daemon, no
root, one click on extensions.gnome.org, GNOME 45 to 51. Handy for anyone
who writes in more than one language on a US keyboard.

GIF: <link>
Extension: https://extensions.gnome.org/extension/10265/accent-hold/

Built with an AI coding assistant, tested by hand, reviewed by EGO.

Julien

## 4. Adrien Linuxtricks (formulaire ou e-mail, en français)

**Objet :** Accent Hold : l'appui long des accents façon macOS, en extension GNOME

Bonjour Adrien,

Une petite extension GNOME qui pourrait trouver sa place dans un CKOIKIDI :
Accent Hold reprend le geste de macOS. On maintient `e`, une bulle propose
é è ê ë, on choisit au chiffre, aux flèches ou à la souris ; une frappe
normale tape `e` comme d'habitude. Ça marche dans les applis GTK, les
terminaux et les applis Electron en Wayland, en AZERTY comme en QWERTY,
sans démon ni root. Un clic sur extensions.gnome.org, GNOME 45 à 51.

GIF de dix secondes : <lien>
Extension : https://extensions.gnome.org/extension/10265/accent-hold/
Sources (GPL) : https://github.com/d101c/accent-hold

Pour l'anecdote technique : sous Wayland une extension ne voit pas une
touche maintenue dans une autre fenêtre, d'où un premier passage par un
raccourci puis par un moteur IBus ; la 2.1 s'accroche à la méthode de
saisie de GNOME Shell, qui reçoit déjà chaque touche tapée dans un champ
texte, et ne retient que les chiffres, les flèches et Entrée pendant que la
bulle est ouverte.

En toute transparence : développé avec un assistant IA, relu et testé à la
main, validé par les relecteurs d'EGO.

Merci pour les vidéos,
Julien

## 5. Brodie Robertson (Mastodon, short)

@BrodieRobertson Small one that might fit a video: Accent Hold, the macOS
hold-a-letter accent popup on GNOME, as a plain extension. The Wayland twist:
extensions can't see held keys, so it hooks GNOME Shell's input method path
instead of IBus. GIF + source: https://github.com/d101c/accent-hold
Built with an AI assistant, tested by hand, EGO-approved.

## 6. The Linux Cast (e-mail, email@thelinuxcast.org)

**Subject:** Rare app for the show: macOS press-and-hold accents on GNOME

Hi Matt,

For the rare-apps segment: Accent Hold, a GNOME extension that brings the
macOS gesture. Hold `e`, pick é è ê ë by number, arrows or mouse; a tap types
normally. Works in GTK, terminals and Wayland Electron, any layout, no
daemon, no root, one click on extensions.gnome.org (GNOME 45 to 51).

GIF: <link>
https://extensions.gnome.org/extension/10265/accent-hold/
https://github.com/d101c/accent-hold

Built with an AI coding assistant, tested by hand, reviewed by EGO.

Julien

## 7. DistroTube (Mastodon, only if the others bite)

@distrotube For the app spotlights: Accent Hold, the macOS "hold a letter,
pick its accent" popup on GNOME, as a plain extension. Any layout, no daemon,
one click on EGO. https://github.com/d101c/accent-hold (built with an AI
assistant, tested by hand).
