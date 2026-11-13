import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

// Insert a character into an application that does not use the GNOME input
// method (XWayland applications such as most Electron ones, Qt 5): put it on
// the clipboard, send Shift+Insert, then put the previous content back.
//
// Shift+Insert rather than Ctrl+V: both keys exist on every layout, terminals
// accept it, and it reads the clipboard in GTK, Qt and Chromium but the
// primary selection in xterm-like applications, so both are set.

// Time given to the application to read the clipboard before it is restored.
const RESTORE_DELAY_MS = 400;
const SELECTIONS = [St.ClipboardType.CLIPBOARD, St.ClipboardType.PRIMARY];

export class PasteInsert {
    constructor() {
        this._device = null;
        this._restoreId = 0;
        this._saved = null;
    }

    insert(text) {
        const clipboard = St.Clipboard.get_default();
        // A second insert before the restore keeps the first saved content.
        if (this._restoreId) {
            GLib.source_remove(this._restoreId);
            this._restoreId = 0;
            this._paste(clipboard, text);
            return;
        }
        const saved = [];
        let pending = SELECTIONS.length;
        SELECTIONS.forEach((type, i) => {
            this._save(clipboard, type, content => {
                saved[i] = content;
                if (--pending === 0) {
                    this._saved = saved;
                    this._paste(clipboard, text);
                }
            });
        });
    }

    // Text when there is some, otherwise the first other format (an image).
    _save(clipboard, type, done) {
        clipboard.get_text(type, (_c, text) => {
            if (text !== null) {
                done({text});
                return;
            }
            const mimetype = clipboard.get_mimetypes(type)[0];
            if (!mimetype) {
                done(null);
                return;
            }
            clipboard.get_content(type, mimetype, (_c2, bytes) =>
                done(bytes ? {mimetype, bytes} : null));
        });
    }

    _paste(clipboard, text) {
        for (const type of SELECTIONS)
            clipboard.set_text(type, text);

        if (!this._device) {
            const seat = global.stage.context.get_backend().get_default_seat();
            this._device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        const time = GLib.get_monotonic_time();
        const {PRESSED, RELEASED} = Clutter.KeyState;
        this._device.notify_keyval(time, Clutter.KEY_Shift_L, PRESSED);
        this._device.notify_keyval(time, Clutter.KEY_Insert, PRESSED);
        this._device.notify_keyval(time, Clutter.KEY_Insert, RELEASED);
        this._device.notify_keyval(time, Clutter.KEY_Shift_L, RELEASED);

        this._restoreId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RESTORE_DELAY_MS, () => {
            this._restoreId = 0;
            this._restore(clipboard);
            return GLib.SOURCE_REMOVE;
        });
    }

    _restore(clipboard) {
        const saved = this._saved;
        this._saved = null;
        if (!saved)
            return;
        SELECTIONS.forEach((type, i) => {
            const content = saved[i];
            if (!content)
                clipboard.set_text(type, '');
            else if ('text' in content)
                clipboard.set_text(type, content.text);
            else
                clipboard.set_content(type, content.mimetype, content.bytes);
        });
    }

    destroy() {
        if (this._restoreId) {
            GLib.source_remove(this._restoreId);
            this._restoreId = 0;
            this._restore(St.Clipboard.get_default());
        }
        this._saved = null;
        this._device = null;
    }
}
