import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as KeyboardStatus from 'resource:///org/gnome/shell/ui/status/keyboard.js';

// Accent picker opened by a keyboard shortcut. Two phases: first wait for a base
// letter, then show its accented variants for selection. A failsafe timeout and
// try/catch around the key handler guarantee the modal grab is always released.
export class AccentPicker {
    // getSettings/getTable are callbacks so the current values are read each time
    // the picker is triggered.
    constructor(getSettings, getTable, gettext) {
        this._getSettings = getSettings;
        this._getTable = getTable;
        this._ = gettext || ((s) => s);

        this._actor = null;
        this._grab = null;
        this._hint = null;
        this._phase = null;        // 'await-letter' | 'variants'
        this._variants = [];
        this._index = 0;
        this._chips = [];
        this._timeoutId = 0;       // failsafe auto-close
        this._delayId = 0;         // optional delay before opening
        this._injectId = 0;        // deferred injection
        this._restoreId = 0;       // clipboard restore

        const seat = Clutter.get_default_backend().get_default_seat();
        this._vdev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    start() {
        if (this._actor || this._delayId)
            return;

        if (!this._layoutAllowed())
            return;

        const settings = this._getSettings();
        let delay = 0;
        try { delay = settings.get_int('delay-ms'); } catch (_e) {}
        if (delay < 0) delay = 0;

        if (delay === 0) {
            this._open();
            return;
        }
        this._delayId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._delayId = 0;
            this._open();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Restrict activation to the xkb layouts listed in `layouts` (empty = all).
    _layoutAllowed() {
        let wanted = [];
        try { wanted = this._getSettings().get_strv('layouts'); } catch (_e) {}
        if (!wanted || wanted.length === 0)
            return true;
        try {
            const mgr = KeyboardStatus.getInputSourceManager();
            const cur = mgr ? mgr.currentSource : null;
            if (!cur)
                return true;
            // Match both ids: prefs stores the input-source id, the runtime may
            // expose xkbId.
            return wanted.includes(cur.xkbId) || wanted.includes(cur.id);
        } catch (_e) {
            return true;
        }
    }

    _open() {
        if (this._actor)
            return;

        this._phase = 'await-letter';
        this._variants = [];
        this._index = 0;
        this._chips = [];

        this._actor = new St.BoxLayout({
            style_class: 'accent-popup',
            reactive: true,
            can_focus: true,
            vertical: false,
        });
        this._hint = new St.Label({
            style_class: 'accent-hint',
            text: this._('Type a letter…'),
        });
        this._actor.add_child(this._hint);

        Main.layoutManager.uiGroup.add_child(this._actor);
        const [x, y] = global.get_pointer();
        this._actor.set_position(x, y + 24);

        this._grab = Main.pushModal(this._actor, {actionMode: Shell.ActionMode.NORMAL});
        if (!this._grab) {
            this._close();
            return;
        }

        // Arm the failsafe right after grabbing so the popup always closes even
        // if a later call throws.
        let timeout = 6000;
        try { timeout = this._getSettings().get_int('popup-timeout-ms'); } catch (_e) {}
        if (timeout < 1000) timeout = 1000;
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () => {
            this._timeoutId = 0;
            this._close();
            return GLib.SOURCE_REMOVE;
        });

        try {
            this._actor.grab_key_focus();
            this._actor.connect('key-press-event', (_a, e) => this._onKey(e));
        } catch (e) {
            logError(e, 'accent-hold: open');
            this._close();
        }
    }

    _onKey(event) {
        try {
            const sym = event.get_key_symbol();
            if (sym === Clutter.KEY_Escape) {
                this._close();
                return Clutter.EVENT_STOP;
            }
            if (this._phase === 'await-letter')
                return this._onAwaitLetter(event, sym);
            return this._onVariants(event, sym);
        } catch (e) {
            logError(e, 'accent-hold: key handler');
            this._close();
            return Clutter.EVENT_STOP;
        }
    }

    // Phase 1: wait for the base letter.
    _onAwaitLetter(event, sym) {
        if (this._isModifier(sym))
            return Clutter.EVENT_STOP;

        // In GJS get_key_unicode() returns the character as a one-char string
        // (case included). Handle a numeric codepoint defensively.
        let ch = event.get_key_unicode();
        if (typeof ch === 'number')
            ch = ch > 0 ? String.fromCodePoint(ch) : '';
        if (!ch) {
            this._close();
            return Clutter.EVENT_STOP;
        }
        const table = this._getTable() || {};
        const variants = table[ch];
        if (variants && variants.length > 0)
            this._showVariants(ch, variants);
        else
            this._close();
        return Clutter.EVENT_STOP;
    }

    _isModifier(sym) {
        return (
            sym === Clutter.KEY_Shift_L || sym === Clutter.KEY_Shift_R ||
            sym === Clutter.KEY_Control_L || sym === Clutter.KEY_Control_R ||
            sym === Clutter.KEY_Alt_L || sym === Clutter.KEY_Alt_R ||
            sym === Clutter.KEY_Super_L || sym === Clutter.KEY_Super_R ||
            sym === Clutter.KEY_Meta_L || sym === Clutter.KEY_Meta_R ||
            sym === Clutter.KEY_Caps_Lock || sym === Clutter.KEY_ISO_Level3_Shift
        );
    }

    // Phase 2: show the accented variants as buttons.
    _showVariants(_letter, variants) {
        this._phase = 'variants';
        this._variants = variants.slice(0, 9); // 1..9 selectable by number
        this._index = 0;

        if (this._hint) {
            this._actor.remove_child(this._hint);
            this._hint.destroy();
            this._hint = null;
        }

        this._chips = this._variants.map((v, i) => {
            const chip = new St.Button({
                style_class: 'accent-chip',
                label: `${i + 1} ${v}`,
                can_focus: false,
            });
            chip.connect('clicked', () => this._choose(i));
            this._actor.add_child(chip);
            return chip;
        });
        this._highlight();
    }

    _onVariants(event, sym) {
        if (sym === Clutter.KEY_Left) {
            this._move(-1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Right) {
            this._move(1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter ||
            sym === Clutter.KEY_space) {
            this._choose(this._index);
            return Clutter.EVENT_STOP;
        }
        const n = this._digitIndex(event, sym);
        if (n >= 0) {
            if (n < this._variants.length)
                this._choose(n);
            return Clutter.EVENT_STOP;
        }
        // Any other key cancels.
        this._close();
        return Clutter.EVENT_STOP;
    }

    // Map a number key to an index 0..8, or -1. Match the hardware keycode first
    // (digit row = keycodes 10..18 on any layout) so number selection works on
    // AZERTY, where the unshifted top row produces symbols. Also accept the digit
    // keysyms and the numeric keypad.
    _digitIndex(event, sym) {
        let code = 0;
        try { code = event.get_key_code(); } catch (_e) {}
        if (code >= 10 && code <= 18)
            return code - 10;
        if (sym >= Clutter.KEY_1 && sym <= Clutter.KEY_9)
            return sym - Clutter.KEY_1;
        if (sym >= Clutter.KEY_KP_1 && sym <= Clutter.KEY_KP_9)
            return sym - Clutter.KEY_KP_1;
        return -1;
    }

    _move(d) {
        const n = this._variants.length;
        if (n === 0)
            return;
        this._index = Math.max(0, Math.min(n - 1, this._index + d));
        this._highlight();
    }

    _highlight() {
        this._chips.forEach((c, i) =>
            i === this._index
                ? c.add_style_pseudo_class('selected')
                : c.remove_style_pseudo_class('selected'));
    }

    _choose(i) {
        const ch = this._variants[i];
        this._close();          // release the grab before injecting
        if (!ch)
            return;
        // Defer one cycle so popModal restores keyboard focus to the target app
        // before the character is inserted.
        this._injectId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._injectId = 0;
            this._inject(ch);
            return GLib.SOURCE_REMOVE;
        });
    }

    // Insert the character by placing it on the clipboard and synthesizing
    // Shift+Insert. A virtual key event for an off-layout Unicode character has no
    // keycode and is rejected by mutter, so the clipboard route is used instead;
    // it also reaches VTE terminals. The previous clipboard contents are restored.
    _inject(ch) {
        try {
            const cb = St.Clipboard.get_default();
            cb.get_text(St.ClipboardType.CLIPBOARD, (_c, saved) => {
                cb.set_text(St.ClipboardType.CLIPBOARD, ch);
                cb.set_text(St.ClipboardType.PRIMARY, ch);
                this._pasteAndRestore(saved);
            });
        } catch (e) {
            logError(e, 'accent-hold: inject');
        }
    }

    _pasteAndRestore(saved) {
        if (!this._vdev)
            return;
        const t = Clutter.get_current_event_time();
        this._vdev.notify_keyval(t, Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
        this._vdev.notify_keyval(t, Clutter.KEY_Insert, Clutter.KeyState.PRESSED);
        this._vdev.notify_keyval(t, Clutter.KEY_Insert, Clutter.KeyState.RELEASED);
        this._vdev.notify_keyval(t, Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
        // Restore the previous clipboard once the paste has been delivered.
        this._restoreId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._restoreId = 0;
            try {
                St.Clipboard.get_default()
                    .set_text(St.ClipboardType.CLIPBOARD, saved || '');
            } catch (e) {
                logError(e, 'accent-hold: restore clipboard');
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _close() {
        if (this._delayId) {
            GLib.source_remove(this._delayId);
            this._delayId = 0;
        }
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        if (this._actor) {
            Main.layoutManager.uiGroup.remove_child(this._actor);
            this._actor.destroy();
            this._actor = null;
        }
        this._hint = null;
        this._chips = [];
        this._variants = [];
        this._index = 0;
        this._phase = null;
    }

    destroy() {
        this._close();
        if (this._injectId) {
            GLib.source_remove(this._injectId);
            this._injectId = 0;
        }
        if (this._restoreId) {
            GLib.source_remove(this._restoreId);
            this._restoreId = 0;
        }
        this._vdev = null;
    }
}
