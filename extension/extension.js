import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AccentPicker} from './accentPicker.js';

// Extension « Accent Hold » : un raccourci clavier (réglage `trigger`, p.ex.
// <Super>e) ouvre un sélecteur d'accents façon macOS. On tape la lettre de
// base, puis on choisit la variante accentuée, insérée dans le champ courant.
export default class AccentHoldExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._table = this._loadTable();
        this._changedIds = [];
        this._bound = false;

        this._picker = new AccentPicker(
            () => this._settings,
            () => this._table,
        );

        this._bind();

        // Re-bind / recharge la table quand les réglages pertinents changent.
        const rebind = () => {
            this._unbind();
            this._bind();
        };
        // Recharger la table n'a aucun lien avec le raccourci : on ne touche
        // PAS au keybinding (sinon on le retire/réajoute pour rien).
        const reloadTable = () => {
            this._table = this._loadTable();
        };
        this._changedIds.push(
            this._settings.connect('changed::enabled', rebind));
        this._changedIds.push(
            this._settings.connect('changed::trigger', rebind));
        this._changedIds.push(
            this._settings.connect('changed::accents', reloadTable));
    }

    disable() {
        this._unbind();

        if (this._changedIds && this._settings) {
            for (const id of this._changedIds)
                this._settings.disconnect(id);
        }
        this._changedIds = [];

        if (this._picker) {
            this._picker.destroy();
            this._picker = null;
        }
        this._settings = null;
        this._table = null;
    }

    _bind() {
        if (this._bound)
            return;
        if (!this._settings.get_boolean('enabled'))
            return;
        Main.wm.addKeybinding(
            'trigger',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            // NORMAL (+ OVERVIEW) : pas sur l'écran de verrouillage (sécurité,
            // exigence EGO). Suffit pour saisir des accents dans une app.
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._picker.start(),
        );
        this._bound = true;
    }

    _unbind() {
        if (!this._bound)
            return;
        Main.wm.removeKeybinding('trigger');
        this._bound = false;
    }

    // Charge la table d'accents : JSON du réglage `accents` s'il est non vide,
    // sinon le fichier accents.json embarqué dans l'extension.
    _loadTable() {
        try {
            const override = this._settings.get_string('accents');
            if (override && override.trim() !== '')
                return JSON.parse(override);
        } catch (e) {
            logError(e, 'accent-hold: parse accents setting');
        }
        try {
            const path = this.path + '/accents.json';
            const [ok, bytes] = GLib.file_get_contents(path);
            if (!ok)
                return {};
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (e) {
            logError(e, 'accent-hold: load accents.json');
            return {};
        }
    }
}
