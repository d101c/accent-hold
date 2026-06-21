import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Flux en deux temps, 100% dans le Shell (aucun daemon, aucun privilège) :
//   1. le raccourci global appelle start()
//   2. on prend un grab modal et on attend une lettre de base (e, a, c, …)
//   3. on affiche les variantes (é è ê …), sélection clavier/souris
//   4. on injecte le caractère choisi via le clavier virtuel Clutter
//      (fonctionne dans GTK/Qt ET le terminal).
export class AccentPicker {
    constructor(table) {
        this._table = table;
        this._actor = null;
        this._grab = null;
        this._phase = null; // 'await-letter' | 'select'
        this._variants = [];
        this._index = 0;
        this._chips = [];
        const seat = Clutter.get_default_backend().get_default_seat();
        this._vdev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    start() {
        if (this._actor) return; // déjà actif
        this._phase = 'await-letter';
        this._actor = new St.BoxLayout({
            style_class: 'accent-popup', reactive: true, can_focus: true,
        });
        this._showHint();
        this._position();
        Main.layoutManager.uiGroup.add_child(this._actor);

        // En GNOME 50, pushModal renvoie TOUJOURS un Clutter.Grab : on détecte
        // l'échec via l'état du seat, pas via une valeur falsy.
        this._grab = Main.pushModal(this._actor, {actionMode: 1 /* NORMAL */});
        if (this._grab.get_seat_state() === Clutter.GrabState.NONE) {
            Main.popModal(this._grab);
            this._grab = null;
            this._teardown();
            return;
        }
        this._actor.grab_key_focus();
        this._actor.connect('key-press-event', (_a, e) => this._onKey(e));
    }

    _showHint() {
        this._actor.remove_all_children();
        this._chips = [];
        this._actor.add_child(new St.Label({
            style_class: 'accent-hint',
            text: 'Tape une lettre accentuable…',
        }));
    }

    _showVariants(base) {
        this._variants = this._table[base] || [];
        if (this._variants.length === 0) { this._close(); return; }
        this._phase = 'select';
        this._index = 0;
        this._actor.remove_all_children();
        this._chips = this._variants.map((v, i) => {
            const chip = new St.Button({
                style_class: 'accent-chip',
                label: `${i + 1} ${v}`,
            });
            chip.connect('clicked', () => this._choose(i));
            this._actor.add_child(chip);
            return chip;
        });
        this._position();
        this._highlight();
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
        if (sym === Clutter.KEY_Escape) { this._close(); return Clutter.EVENT_STOP; }

        if (this._phase === 'await-letter') {
            // get_key_unicode() donne la casse réelle (Shift+E -> 'E').
            const uni = event.get_key_unicode();
            if (uni > 0) {
                const ch = String.fromCodePoint(uni);
                if (this._table[ch]) this._showVariants(ch);
                else this._close(); // lettre non accentuable -> on annule
            }
            return Clutter.EVENT_STOP;
        }

        // phase 'select'
        if (sym === Clutter.KEY_Left)  { this._index = Math.max(0, this._index - 1); this._highlight(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Right) { this._index = Math.min(this._variants.length - 1, this._index + 1); this._highlight(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) { this._choose(this._index); return Clutter.EVENT_STOP; }
        if (sym >= Clutter.KEY_1 && sym <= Clutter.KEY_9) {
            const n = sym - Clutter.KEY_1;
            if (n < this._variants.length) this._choose(n);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_STOP; // modal : on consomme tout
    }

    _choose(i) {
        const ch = this._variants[i];
        this._close();
        this._inject(ch);
    }

    _inject(ch) {
        const keyval = 0x01000000 | ch.codePointAt(0);
        const t = Clutter.get_current_event_time();
        this._vdev.notify_keyval(t, keyval, Clutter.KeyState.PRESSED);
        this._vdev.notify_keyval(t, keyval, Clutter.KeyState.RELEASED);
    }

    _close() {
        if (this._grab) { Main.popModal(this._grab); this._grab = null; }
        this._teardown();
    }

    _teardown() {
        if (this._actor) {
            Main.layoutManager.uiGroup.remove_child(this._actor);
            this._actor.destroy();
            this._actor = null;
        }
        this._phase = null;
        this._chips = [];
        this._variants = [];
    }

    destroy() { this._close(); this._vdev = null; }
}
