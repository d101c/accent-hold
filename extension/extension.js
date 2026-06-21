import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AccentPopup} from './accentPopup.js';

// Service D-Bus appelé par le daemon accent-holdd quand un appui long est
// détecté sur une lettre accentuable.
const IFACE = `
<node>
  <interface name="dev.accenthold.Popup">
    <method name="Trigger">
      <arg type="s" direction="in" name="letter"/>
      <arg type="b" direction="out" name="handled"/>
    </method>
  </interface>
</node>`;

export default class AccentHoldExtension extends Extension {
    enable() {
        this._table = this._loadTable();
        this._popup = new AccentPopup(this._table);
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, '/dev/accenthold/Popup');
        this._nameId = Gio.bus_own_name_on_connection(
            Gio.DBus.session, 'dev.accenthold.Popup',
            Gio.BusNameOwnerFlags.NONE, null, null);
    }

    disable() {
        if (this._nameId) { Gio.bus_unown_name(this._nameId); this._nameId = 0; }
        if (this._dbus) { this._dbus.unexport(); this._dbus = null; }
        if (this._popup) { this._popup.destroy(); this._popup = null; }
        this._table = null;
    }

    // Méthode D-Bus : montre la popup des variantes de `letter`.
    Trigger(letter) {
        try {
            return this._popup.show(letter);
        } catch (e) {
            logError(e, 'accent-hold: Trigger');
            return false;
        }
    }

    _loadTable() {
        const path = this.path + '/accents.json';
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok) return {};
        return JSON.parse(new TextDecoder().decode(bytes));
    }
}
