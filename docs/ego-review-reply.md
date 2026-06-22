# Reply to post on the EGO review page (#72085)

Copy-paste the text below as the developer reply, then upload the new version
(rebuilt with `./pack.sh`).

---

Thank you for the review.

On the AI question, honestly: I used an AI assistant as a development tool, which
the guidelines permit ("learning aid or a development tool"). I've gone back over
the whole codebase so I can stand behind and explain every part of it, and I've
just pushed a cleanup pass addressing the points below. Happy to explain any
specific line you'd like.

What changed in the new version:

**EGO-X-004 — synchronous file IO (fixed).**
The accent table no longer lives in a JSON file read at startup. It is now a plain
JavaScript module (`defaultAccents.js`) imported directly, so there is no
synchronous file IO in the shell process at all.

**Code consistency.**
All comments and the GSettings schema are now in English (the code previously
mixed French comments with English code), redundant comments were trimmed, and an
inconsistently named helper was renamed.

**EGO-A-005 — direct clipboard access (kept, with justification).**
This is intentional, and I'd like to explain it rather than remove it, because it
is what makes the feature work. The extension inserts an arbitrary Unicode
character (é, ñ, œ, …) into whatever is focused, including VTE terminals.
Synthesizing the character with a virtual input device does not work:
`notify_keyval()` for a codepoint that is not on the active keymap is rejected by
mutter ("No keycode found for keyval"). The reliable path is to put the single
character on the clipboard and synthesize Shift+Insert (which use real keysyms).

The clipboard is handled carefully (`accentPicker.js`, `_inject()` /
`_pasteAndRestore()`):
1. read and save the user's current CLIPBOARD contents,
2. set CLIPBOARD + PRIMARY to the single character,
3. synthesize the paste,
4. restore the saved CLIPBOARD contents.

If you'd prefer a different insertion mechanism I'm glad to change it, but I have
not found one that works in terminals on Wayland without privileged input access.

For completeness: the keybinding is restricted to NORMAL/OVERVIEW action modes
(never the lock screen), the modal grab is always released (a failsafe timeout
plus try/catch around the key handler), and all settings handlers, the keybinding
and the indicator are disconnected/destroyed in `disable()`/`destroy()`.

Thanks for taking the time.
