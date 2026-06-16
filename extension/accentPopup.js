import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class AccentPopup {
    constructor(table) {
        this._table = table;
        this._actor = null;
        this._variants = [];
        this._index = 0;
        this._grab = null;
        const seat = Clutter.get_default_backend().get_default_seat();
        this._vdev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    show(letter) {
        this._variants = this._table[letter] || [];
        if (this._variants.length === 0) return;
        this._index = 0;
        this._build();
        this._position();
        Main.layoutManager.uiGroup.add_child(this._actor);
        // En GNOME 50, pushModal renvoie TOUJOURS un Clutter.Grab : on détecte
        // l'échec via l'état du seat, pas via une valeur falsy.
        this._grab = Main.pushModal(this._actor, {actionMode: 1 /* NORMAL */});
        if (this._grab.get_seat_state() === Clutter.GrabState.NONE) {
            Main.popModal(this._grab);
            this._grab = null;
            this.hide();
            return;
        }
        // Le grab modal ne déplace pas le focus clavier : sans ceci, les touches
        // (flèches/chiffres/Entrée) n'arrivent jamais à l'acteur.
        this._actor.grab_key_focus();
        this._actor.connect('key-press-event', (a, e) => this._onKey(e));
        this._highlight();
    }

    _build() {
        this._actor = new St.BoxLayout({
            style_class: 'accent-popup', reactive: true, can_focus: true,
        });
        this._chips = this._variants.map((v, i) => {
            const chip = new St.Button({
                style_class: 'accent-chip',
                label: `${i + 1} ${v}`,
            });
            chip.connect('clicked', () => this._choose(i));
            this._actor.add_child(chip);
            return chip;
        });
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
        if (sym === Clutter.KEY_Escape) { this.hide(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Left)  { this._index = Math.max(0, this._index - 1); this._highlight(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Right) { this._index = Math.min(this._variants.length - 1, this._index + 1); this._highlight(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) { this._choose(this._index); return Clutter.EVENT_STOP; }
        if (sym >= Clutter.KEY_1 && sym <= Clutter.KEY_9) {
            const n = sym - Clutter.KEY_1;
            if (n < this._variants.length) this._choose(n);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_STOP; // popup modale : on consomme tout
    }

    _choose(i) {
        const ch = this._variants[i];
        this.hide();
        this._inject(ch);
    }

    _inject(ch) {
        const cp = ch.codePointAt(0);
        const keyval = 0x01000000 | cp;
        const t = Clutter.get_current_event_time();
        this._vdev.notify_keyval(t, keyval, Clutter.KeyState.PRESSED);
        this._vdev.notify_keyval(t, keyval, Clutter.KeyState.RELEASED);
    }

    hide() {
        if (this._grab) { Main.popModal(this._grab); this._grab = null; }
        if (this._actor) {
            Main.layoutManager.uiGroup.remove_child(this._actor);
            this._actor.destroy(); this._actor = null;
        }
    }

    destroy() { this.hide(); this._vdev = null; }
}
