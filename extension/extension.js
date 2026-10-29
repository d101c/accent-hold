import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AccentPicker} from './accentPicker.js';
import {PressHold} from './pressHold.js';
import {addIndicator} from './panelIndicator.js';
import {DEFAULT_ACCENTS} from './defaultAccents.js';

// Hold an accentable letter to choose its accented variant (pressHold.js), or
// press the `trigger` shortcut (e.g. <Super>e) then type the base letter.
export default class AccentHoldExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._table = this._loadTable();
        this._bound = false;

        this._picker = new AccentPicker(
            this._settings,
            () => this._table,
            _,
        );

        this._bind();

        this._pressHold = new PressHold(this._settings, () => this._table);

        this._indicator = null;
        if (this._settings.get_boolean('show-indicator'))
            this._addIndicator();

        const rebind = () => {
            this._unbind();
            this._bind();
        };
        const toggleIndicator = () => {
            if (this._settings.get_boolean('show-indicator'))
                this._addIndicator();
            else
                this._removeIndicator();
        };
        const reloadTable = () => {
            this._table = this._loadTable();
        };
        this._settings.connectObject(
            'changed::enabled', rebind,
            'changed::trigger', rebind,
            'changed::accents', reloadTable,
            'changed::show-indicator', toggleIndicator,
            this);
    }

    disable() {
        this._unbind();
        this._removeIndicator();

        this._pressHold.destroy();
        this._pressHold = null;

        this._settings.disconnectObject(this);

        if (this._picker) {
            this._picker.destroy();
            this._picker = null;
        }
        this._settings = null;
        this._table = null;
    }

    _addIndicator() {
        if (this._indicator)
            return;
        const iconPath = this.path + '/icons/accent-hold-symbolic.svg';
        this._indicator = addIndicator(
            this.uuid,
            this._settings,
            iconPath,
            () => this.openPreferences(),
            _,
        );
    }

    _removeIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
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
            // Not active on the lock screen.
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

    // Use the user's `accents` override when set, otherwise the built-in table.
    _loadTable() {
        try {
            const override = this._settings.get_string('accents');
            if (override && override.trim() !== '')
                return JSON.parse(override);
        } catch (e) {
            logError(e, 'accent-hold: parse accents setting');
        }
        return DEFAULT_ACCENTS;
    }
}
