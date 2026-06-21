import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Indicateur de la barre supérieure pour « Accent Hold ».
// Affiche l'icône symbolique de l'extension et un petit menu :
//   - un interrupteur lié à la clé GSettings `enabled` (active / inhibe le
//     raccourci, en restant synchro avec les réglages) ;
//   - un raccourci vers les Préférences de l'extension.
export const AccentHoldIndicator = GObject.registerClass(
class AccentHoldIndicator extends PanelMenu.Button {
    // settings        : Gio.Settings de l'extension.
    // iconPath        : chemin absolu vers l'icône SVG symbolique.
    // openPreferences : callback ouvrant les préférences (extension.openPreferences()).
    _init(settings, iconPath, openPreferences, gettext) {
        // Fonction de traduction fournie par extension.js (gettext lié au
        // domaine `accent-hold`). Repli identité si absente.
        const _ = gettext || ((s) => s);
        super._init(0.0, _('Accent Hold'));

        this._settings = settings;
        this._openPreferences = openPreferences;
        this._settingsChangedId = 0;

        // Icône symbolique recolorée par le thème de la barre.
        this.add_child(new St.Icon({
            gicon: Gio.icon_new_for_string(iconPath),
            style_class: 'system-status-icon',
        }));

        // Interrupteur lié à `enabled`.
        this._toggle = new PopupMenu.PopupSwitchMenuItem(
            _('Enabled'), this._settings.get_boolean('enabled'));
        this._toggle.connect('toggled', (_item, state) => {
            // Évite une boucle : ne réécrit que si la valeur change.
            if (this._settings.get_boolean('enabled') !== state)
                this._settings.set_boolean('enabled', state);
        });
        this.menu.addMenuItem(this._toggle);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Entrée « Préférences ».
        const prefsItem = new PopupMenu.PopupMenuItem(_('Preferences'));
        prefsItem.connect('activate', () => {
            if (this._openPreferences)
                this._openPreferences();
        });
        this.menu.addMenuItem(prefsItem);

        // Garde l'interrupteur synchro si `enabled` change ailleurs (prefs, etc.).
        this._settingsChangedId = this._settings.connect('changed::enabled', () => {
            this._toggle.setToggleState(this._settings.get_boolean('enabled'));
        });
    }

    destroy() {
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._settings = null;
        this._openPreferences = null;
        this._toggle = null;
        super.destroy();
    }
});

// Crée l'indicateur et l'ajoute à la barre du haut. Renvoie l'instance.
export function addIndicator(uuid, settings, iconPath, openPreferences, gettext) {
    const indicator = new AccentHoldIndicator(settings, iconPath, openPreferences, gettext);
    Main.panel.addToStatusArea(uuid, indicator);
    return indicator;
}
