import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Top-bar indicator: the extension icon plus a menu with a switch that
// pauses the whole extension (press-and-hold and the shortcut, through the
// `paused` setting), a shortcut to the preferences and an item that hides
// the icon.
export const AccentHoldIndicator = GObject.registerClass(
class AccentHoldIndicator extends PanelMenu.Button {
    _init(settings, iconPath, openPreferences, gettext) {
        const _ = gettext || ((s) => s);
        super._init(0.0, _('Accent Hold'));

        this._settings = settings;
        this._openPreferences = openPreferences;

        this.add_child(new St.Icon({
            gicon: Gio.icon_new_for_string(iconPath),
            style_class: 'system-status-icon',
        }));

        this._toggle = new PopupMenu.PopupSwitchMenuItem(
            _('Enabled'), !this._settings.get_boolean('paused'));
        this._toggle.connectObject('toggled', (_item, state) => {
            if (this._settings.get_boolean('paused') === state)
                this._settings.set_boolean('paused', !state);
        }, this);
        this.menu.addMenuItem(this._toggle);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefsItem = new PopupMenu.PopupMenuItem(_('Preferences'));
        prefsItem.connectObject('activate', () => this._openPreferences(), this);
        this.menu.addMenuItem(prefsItem);

        // The switch that brings it back is in the preferences.
        const hideItem = new PopupMenu.PopupMenuItem(_('Hide this icon'));
        hideItem.connectObject('activate',
            () => this._settings.set_boolean('show-indicator', false), this);
        this.menu.addMenuItem(hideItem);

        // Keep the toggle in sync when `paused` changes elsewhere.
        this._settings.connectObject('changed::paused', () => {
            this._toggle.setToggleState(!this._settings.get_boolean('paused'));
        }, this);
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._settings = null;
        this._openPreferences = null;
        this._toggle = null;
        super.destroy();
    }
});

export function addIndicator(uuid, settings, iconPath, openPreferences, gettext) {
    const indicator = new AccentHoldIndicator(settings, iconPath, openPreferences, gettext);
    Main.panel.addToStatusArea(uuid, indicator);
    return indicator;
}
