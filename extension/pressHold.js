import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import IBus from 'gi://IBus';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as KeyboardStatus from 'resource:///org/gnome/shell/ui/status/keyboard.js';
import {HoldMachine, NAV_KEYS, makeKey} from './holdMachine.js';

// Press-and-hold without an input method engine.
//
// On Wayland, GNOME Shell's input method (misc/inputMethod.js) sees every key
// typed into a text field and asks IBus about it through
// IBus.InputContext.process_key_event_async(). Wrapping that call lets the
// extension watch the keys and swallow the few it needs (digits, arrows...
// while the variants are shown); everything else goes on to IBus unchanged.
// Only applications using the Wayland text-input protocol go through it.

// Stand-in for the GAsyncResult of a key we swallowed.
const CONSUMED = {};

// Time given to the application to process a forwarded BackSpace before the
// replacement is committed.
const COMMIT_DELAY_MS = 120;
const BACKSPACE_EVCODE = 14;

const MODIFIER_KEYS = new Set([
    'Shift_L', 'Shift_R', 'Control_L', 'Control_R', 'Alt_L', 'Alt_R',
    'Meta_L', 'Meta_R', 'Super_L', 'Super_R', 'Hyper_L', 'Hyper_R',
    'Caps_Lock', 'Shift_Lock', 'Num_Lock', 'Scroll_Lock',
    'ISO_Level3_Shift', 'ISO_Level5_Shift', 'Mode_switch',
    'ISO_Next_Group', 'ISO_Prev_Group', 'Multi_key',
]);
const SHORTCUT_MASK = IBus.ModifierType.CONTROL_MASK | IBus.ModifierType.MOD1_MASK |
    IBus.ModifierType.MOD4_MASK | IBus.ModifierType.SUPER_MASK;

export class PressHold {
    constructor(settings, getTable) {
        this._settings = settings;
        this._machine = new HoldMachine(getTable);
        this._popup = null;
        this._chips = [];
        this._holdId = 0;
        this._commitId = 0;
        this._timeoutId = 0;

        const proto = IBus.InputContext.prototype;
        this._origProcess = proto.process_key_event_async;
        this._origFinish = proto.process_key_event_async_finish;
        const self = this;
        proto.process_key_event_async = function (...args) {
            const callback = args[args.length - 1];
            if (typeof callback === 'function' && self._filter(args[0], args[1], args[2])) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    callback(this, CONSUMED);
                    return GLib.SOURCE_REMOVE;
                });
                return undefined;
            }
            return self._origProcess.apply(this, args);
        };
        proto.process_key_event_async_finish = function (res) {
            if (res === CONSUMED)
                return true;
            return self._origFinish.call(this, res);
        };

        global.display.connectObject('notify::focus-window', () => this._cancel(), this);
    }

    destroy() {
        const proto = IBus.InputContext.prototype;
        proto.process_key_event_async = this._origProcess;
        proto.process_key_event_async_finish = this._origFinish;
        global.display.disconnectObject(this);
        this._cancel();
        this._removeSource('_commitId');
        this._settings = null;
    }

    // Returns true when the key must not reach the application.
    _filter(keyval, keycode, state) {
        try {
            if (!this._active())
                return false;
            const result = this._machine.key(this._key(keyval, keycode, state));
            this._run(result.actions);
            return result.consumed;
        } catch (e) {
            logError(e, 'accent-hold: press-and-hold');
            this._cancel();
            return false;
        }
    }

    _active() {
        if (!this._settings.get_boolean('press-and-hold'))
            return false;
        const source = KeyboardStatus.getInputSourceManager().currentSource;
        // An IBus engine (ours or a CJK one) handles the keys itself.
        if (!source || source.type !== 'xkb')
            return false;
        const wanted = this._settings.get_strv('layouts');
        return wanted.length === 0 || wanted.includes(source.id) || wanted.includes(source.xkbId);
    }

    _key(keyval, keycode, state) {
        const name = IBus.keyval_name(keyval) || '';
        let char = IBus.keyval_to_unicode(keyval);
        if (typeof char === 'number')
            char = char > 0 ? String.fromCodePoint(char) : '';
        if (!char || /\p{C}/u.test(char))
            char = '';
        let keypadDigit = -1;
        const kp = /^KP_([1-9])$/.exec(name);
        if (kp)
            keypadDigit = Number(kp[1]) - 1;
        return makeKey({
            keyval,
            keycode,
            char,
            release: (state & IBus.ModifierType.RELEASE_MASK) !== 0,
            shortcut: (state & SHORTCUT_MASK) !== 0,
            modifier: MODIFIER_KEYS.has(name),
            name: NAV_KEYS.has(name) ? name : '',
            keypadDigit,
        });
    }

    _run(actions) {
        for (const [kind, ...args] of actions) {
            if (kind === 'arm') {
                this._removeSource('_holdId');
                const ms = this._settings.get_int('hold-ms');
                this._holdId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                    this._holdId = 0;
                    this._run(this._machine.holdElapsed());
                    return GLib.SOURCE_REMOVE;
                });
            } else if (kind === 'disarm') {
                this._removeSource('_holdId');
            } else if (kind === 'show') {
                this._show(...args);
            } else if (kind === 'move') {
                this._highlight(args[0]);
            } else if (kind === 'hide') {
                this._hide();
            } else if (kind === 'replace') {
                this._replace(...args);
            }
        }
    }

    _cancel() {
        this._run(this._machine.cancel());
    }

    // -- variants popup ------------------------------------------------------

    _show(candidates, index) {
        this._hide();
        this._popup = new St.BoxLayout({style_class: 'accent-popup', reactive: true});
        this._chips = candidates.map((text, i) => {
            const chip = new St.Button({
                style_class: 'accent-chip',
                label: `${i + 1} ${text}`,
                can_focus: false,
            });
            chip.connect('clicked', () => this._run(this._machine.candidateClicked(i)));
            this._popup.add_child(chip);
            return chip;
        });
        Main.layoutManager.uiGroup.add_child(this._popup);
        this._place();
        this._highlight(index);

        // Failsafe: never leave the popup up.
        const timeout = Math.max(1000, this._settings.get_int('popup-timeout-ms'));
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () => {
            this._timeoutId = 0;
            this._cancel();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Below the text cursor when the application reports it, else the pointer.
    _place() {
        const rect = Main.inputMethod?._cursorRect;
        let x, y;
        if (rect && (rect.x || rect.y)) {
            [x, y] = [rect.x, rect.y + rect.height + 6];
        } else {
            const [px, py] = global.get_pointer();
            [x, y] = [px, py + 24];
        }
        const monitor = Main.layoutManager.findMonitorForPoint?.(x, y) ??
            Main.layoutManager.primaryMonitor;
        const [, natWidth] = this._popup.get_preferred_width(-1);
        if (monitor)
            x = Math.max(monitor.x, Math.min(x, monitor.x + monitor.width - natWidth));
        this._popup.set_position(Math.round(x), Math.round(y));
    }

    _highlight(index) {
        this._chips.forEach((chip, i) =>
            i === index
                ? chip.add_style_pseudo_class('selected')
                : chip.remove_style_pseudo_class('selected'));
    }

    _hide() {
        this._removeSource('_timeoutId');
        if (this._popup) {
            this._popup.destroy();
            this._popup = null;
        }
        this._chips = [];
    }

    // -- text replacement ----------------------------------------------------

    // The letter was inserted by the application itself: delete it, then
    // commit the accented variant.
    _replace(base, text) {
        const im = Main.inputMethod;
        if (!im)
            return;
        if (this._canDeleteBeforeCursor(im, base)) {
            im.delete_surrounding(-1, 1);
            im.commit(text);
            return;
        }
        const time = global.display.get_current_time_roundtrip();
        const code = BACKSPACE_EVCODE + 8;
        im.forward_key(Clutter.KEY_BackSpace, code, 0, time, true);
        im.forward_key(Clutter.KEY_BackSpace, code, 0, time, false);
        this._removeSource('_commitId');
        this._commitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COMMIT_DELAY_MS, () => {
            this._commitId = 0;
            im.commit(text);
            return GLib.SOURCE_REMOVE;
        });
    }

    // Only trust surrounding text when it shows our letter right before the
    // cursor: some clients report it but ignore deletions.
    _canDeleteBeforeCursor(im, base) {
        const [value, cursor, anchor] = im.getSurroundingText();
        if (typeof value !== 'string' || cursor !== anchor)
            return false;
        const chars = Array.from(value);
        return cursor > 0 && cursor <= chars.length && chars[cursor - 1] === base;
    }

    _removeSource(field) {
        if (this[field]) {
            GLib.source_remove(this[field]);
            this[field] = 0;
        }
    }
}
