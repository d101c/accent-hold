import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Popup déclenchée par le daemon (appui long détecté sur une lettre).
// Conçue pour NE JAMAIS geler le clavier :
//   - try/catch dans le handler -> sur toute exception, on libère le grab
//   - failsafe : auto-fermeture après 6 s quoi qu'il arrive
//   - on ferme le grab AVANT d'injecter
//   - aucune dépendance à get_key_unicode (qui n'existe pas en GNOME 50)
export class AccentPopup {
    constructor(table) {
        this._table = table;
        this._actor = null;
        this._grab = null;
        this._variants = [];
        this._index = 0;
        this._chips = [];
        this._timeoutId = 0;
        const seat = Clutter.get_default_backend().get_default_seat();
        this._vdev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    // Appelée via D-Bus avec la lettre de base. Retourne true si la popup s'ouvre.
    show(letter) {
        if (this._actor) this._close(); // jamais deux popups simultanées
        this._variants = this._table[letter] || [];
        if (this._variants.length === 0) return false;
        this._index = 0;

        this._actor = new St.BoxLayout({
            style_class: 'accent-popup', reactive: true, can_focus: true,
        });
        this._chips = this._variants.map((v, i) => {
            const chip = new St.Button({
                style_class: 'accent-chip', label: `${i + 1} ${v}`,
            });
            chip.connect('clicked', () => this._choose(i));
            this._actor.add_child(chip);
            return chip;
        });

        Main.layoutManager.uiGroup.add_child(this._actor);
        const [x, y] = global.get_pointer();
        this._actor.set_position(x, y + 24);

        // NB GNOME 50 (mutter-18) : Clutter.GrabState et Grab.get_seat_state
        // N'EXISTENT PAS (vérifié par introspection). Tenter de les utiliser
        // levait une exception qui laissait le grab pris -> clavier figé.
        // On ne teste donc pas l'état du grab ; le failsafe 6 s couvre l'échec.
        this._grab = Main.pushModal(this._actor, {actionMode: 1 /* NORMAL */});
        if (!this._grab) { this._close(); return false; }
        this._actor.grab_key_focus();
        this._actor.connect('key-press-event', (_a, e) => this._onKey(e));

        // FAILSAFE anti-freeze : la popup se ferme seule après 6 s.
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 6000, () => {
            this._timeoutId = 0;
            this._close();
            return GLib.SOURCE_REMOVE;
        });
        this._highlight();
        return true;
    }

    _onKey(event) {
        try {
            const sym = event.get_key_symbol();
            if (sym === Clutter.KEY_Escape) { this._close(); return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Left)  { this._move(-1); return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Right) { this._move(1);  return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) {
                this._choose(this._index); return Clutter.EVENT_STOP;
            }
            if (sym >= Clutter.KEY_1 && sym <= Clutter.KEY_9) {
                const n = sym - Clutter.KEY_1;
                if (n < this._variants.length) this._choose(n);
                return Clutter.EVENT_STOP;
            }
            // Toute autre touche annule proprement (jamais coincé).
            this._close();
            return Clutter.EVENT_STOP;
        } catch (e) {
            logError(e, 'accent-hold: key handler');
            this._close(); // sur exception : on libère TOUJOURS le grab
            return Clutter.EVENT_STOP;
        }
    }

    _move(d) {
        this._index = Math.max(0, Math.min(this._variants.length - 1, this._index + d));
        this._highlight();
    }

    _highlight() {
        this._chips.forEach((c, i) =>
            i === this._index ? c.add_style_pseudo_class('selected')
                              : c.remove_style_pseudo_class('selected'));
    }

    _choose(i) {
        const ch = this._variants[i];
        this._close();          // libère le grab AVANT d'injecter
        if (!ch) return;
        // Diffère d'un cycle : laisse popModal rendre le focus clavier à l'app
        // cible avant d'injecter (sinon le caractère pourrait se perdre).
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._inject(ch);
            return GLib.SOURCE_REMOVE;
        });
    }

    // notify_keyval(unicode) NE MARCHE PAS : mutter ne trouve pas de keycode
    // pour un keysym absent du layout ("No keycode found for keyval").
    // On colle donc le caractère via le presse-papier + Shift+Inser, dont les
    // keysyms (Shift, Inser) existent vraiment. Shift+Inser colle la sélection
    // primaire dans les terminaux (VTE) et le presse-papier dans GTK -> on
    // renseigne les DEUX. L'ancien presse-papier est restauré ensuite.
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
        if (!this._vdev) return;
        const t = Clutter.get_current_event_time();
        this._vdev.notify_keyval(t, Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
        this._vdev.notify_keyval(t, Clutter.KEY_Insert, Clutter.KeyState.PRESSED);
        this._vdev.notify_keyval(t, Clutter.KEY_Insert, Clutter.KeyState.RELEASED);
        this._vdev.notify_keyval(t, Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
        // restaure l'ancien presse-papier une fois la colle effectuée
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
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
        if (this._timeoutId) { GLib.source_remove(this._timeoutId); this._timeoutId = 0; }
        if (this._grab) { Main.popModal(this._grab); this._grab = null; }
        if (this._actor) {
            Main.layoutManager.uiGroup.remove_child(this._actor);
            this._actor.destroy();
            this._actor = null;
        }
        this._chips = [];
        this._variants = [];
    }

    destroy() { this._close(); this._vdev = null; }
}
