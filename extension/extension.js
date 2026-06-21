import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AccentPicker} from './accentPicker.js';

export default class AccentHoldExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._table = this._loadTable();
        this._picker = new AccentPicker(this._table);

        // Raccourci global : capté par le Shell dans TOUTES les apps (terminal
        // inclus). Aucun accès périphérique privilégié requis.
        Main.wm.addKeybinding(
            'trigger',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._picker.start()
        );
    }

    disable() {
        Main.wm.removeKeybinding('trigger');
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this._table = null;
        this._settings = null;
    }

    _loadTable() {
        const path = this.path + '/accents.json';
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok) return {};
        return JSON.parse(new TextDecoder().decode(bytes));
    }
}
