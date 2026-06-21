import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Libellés lisibles pour quelques layouts xkb courants ; sinon on affiche l'id brut.
const LAYOUT_LABELS = {
    'fr': 'Français (fr)',
    'fr+oss': 'Français (variante oss)',
    'us': 'Anglais US (us)',
    'us+intl': 'Anglais US international',
    'gb': 'Anglais GB (gb)',
    'de': 'Allemand (de)',
    'es': 'Espagnol (es)',
    'it': 'Italien (it)',
    'pt': 'Portugais (pt)',
    'be': 'Belge (be)',
    'ch': 'Suisse (ch)',
    'ca': 'Canadien (ca)',
};

export default class AccentHoldPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Accent Hold',
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        });
        window.add(page);

        this._buildShortcutGroup(page, settings);
        this._buildBehaviorGroup(page, settings);
        this._buildAccentsGroup(page, settings);
        this._buildLayoutsGroup(page, settings);
    }

    // ---------------------------------------------------------------- Raccourci
    _buildShortcutGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Raccourci',
            description: 'Touche déclenchant le sélecteur d’accents.',
        });
        page.add(group);

        // enabled : SwitchRow lié directement.
        const enabledRow = new Adw.SwitchRow({
            title: 'Activé',
            subtitle: 'Active ou inhibe le raccourci.',
        });
        group.add(enabledRow);
        settings.bind('enabled', enabledRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // trigger : ActionRow + bouton de capture (Gtk.EventControllerKey).
        const triggerRow = new Adw.ActionRow({
            title: 'Combinaison',
            subtitle: 'Cliquez sur le bouton puis appuyez sur la combinaison.',
        });

        const button = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            has_frame: true,
        });

        const accelLabel = (arr) => {
            const a = arr && arr.length ? arr[0] : '';
            return a ? a : 'Désactivé';
        };
        const refreshButton = () => {
            button.label = accelLabel(settings.get_strv('trigger'));
        };
        refreshButton();

        let capturing = false;
        const keyController = new Gtk.EventControllerKey();
        button.add_controller(keyController);

        const stopCapture = () => {
            capturing = false;
            refreshButton();
        };

        button.connect('clicked', () => {
            if (capturing) {
                stopCapture();
                return;
            }
            capturing = true;
            button.label = 'Appuyez sur une touche…';
            button.grab_focus();
        });

        keyController.connect('key-pressed', (_c, keyval, _keycode, state) => {
            if (!capturing)
                return Gdk.EVENT_PROPAGATE;

            // Échap : annuler. Backspace/Delete : effacer.
            if (keyval === Gdk.KEY_Escape) {
                stopCapture();
                return Gdk.EVENT_STOP;
            }
            if (keyval === Gdk.KEY_BackSpace || keyval === Gdk.KEY_Delete) {
                settings.set_strv('trigger', []);
                stopCapture();
                return Gdk.EVENT_STOP;
            }

            // Ignorer les modificateurs seuls.
            if (this._isModifierKey(keyval))
                return Gdk.EVENT_STOP;

            const mask = state & Gtk.accelerator_get_default_mod_mask();
            if (!Gtk.accelerator_valid(keyval, mask))
                return Gdk.EVENT_STOP;

            const accel = Gtk.accelerator_name(keyval, mask);
            if (accel) {
                settings.set_strv('trigger', [accel]);
            }
            stopCapture();
            return Gdk.EVENT_STOP;
        });

        triggerRow.add_suffix(button);
        triggerRow.activatable_widget = button;
        group.add(triggerRow);

        // Repli : EntryRow éditable pour saisir l'accélérateur à la main.
        const entryRow = new Adw.EntryRow({
            title: 'Accélérateur (texte)',
        });
        const syncEntry = () => {
            const arr = settings.get_strv('trigger');
            entryRow.text = arr && arr.length ? arr[0] : '';
        };
        syncEntry();
        entryRow.connect('apply', () => {
            const txt = entryRow.text.trim();
            if (txt === '') {
                settings.set_strv('trigger', []);
                return;
            }
            const [ok, keyval, mods] = Gtk.accelerator_parse(txt);
            if (ok && Gtk.accelerator_valid(keyval, mods)) {
                settings.set_strv('trigger', [Gtk.accelerator_name(keyval, mods)]);
            } else {
                // Saisie libre : on l'enregistre telle quelle (l'utilisateur sait).
                settings.set_strv('trigger', [txt]);
            }
        });
        group.add(entryRow);

        // Garder les widgets synchronisés avec la clé.
        const changedId = settings.connect('changed::trigger', () => {
            refreshButton();
            syncEntry();
        });
        window_destroy_cleanup(group, settings, changedId);
    }

    _isModifierKey(keyval) {
        switch (keyval) {
            case Gdk.KEY_Shift_L:
            case Gdk.KEY_Shift_R:
            case Gdk.KEY_Control_L:
            case Gdk.KEY_Control_R:
            case Gdk.KEY_Alt_L:
            case Gdk.KEY_Alt_R:
            case Gdk.KEY_Super_L:
            case Gdk.KEY_Super_R:
            case Gdk.KEY_Meta_L:
            case Gdk.KEY_Meta_R:
            case Gdk.KEY_Hyper_L:
            case Gdk.KEY_Hyper_R:
            case Gdk.KEY_Caps_Lock:
            case Gdk.KEY_ISO_Level3_Shift:
                return true;
            default:
                return false;
        }
    }

    // ------------------------------------------------------------- Comportement
    _buildBehaviorGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Comportement',
        });
        page.add(group);

        const delayRow = new Adw.SpinRow({
            title: 'Latence avant affichage',
            subtitle: 'Millisecondes avant l’apparition de la popup.',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 10,
                page_increment: 100,
            }),
        });
        group.add(delayRow);
        settings.bind('delay-ms', delayRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        const timeoutRow = new Adw.SpinRow({
            title: 'Auto-fermeture (failsafe)',
            subtitle: 'Millisecondes avant fermeture automatique.',
            adjustment: new Gtk.Adjustment({
                lower: 1000,
                upper: 30000,
                step_increment: 250,
                page_increment: 1000,
            }),
        });
        group.add(timeoutRow);
        settings.bind('popup-timeout-ms', timeoutRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);
    }

    // ------------------------------------------------- Caractères accentuables
    _buildAccentsGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Caractères accentuables',
            description: 'Table JSON : touche de base → liste de variantes accentuées.',
        });
        page.add(group);

        const defaultJson = this._readDefaultAccents();

        const buffer = new Gtk.TextBuffer();
        const loadFromSettings = () => {
            const stored = settings.get_string('accents');
            buffer.text = stored && stored.trim() !== '' ? stored : defaultJson;
        };
        loadFromSettings();

        const textView = new Gtk.TextView({
            buffer: buffer,
            monospace: true,
            top_margin: 8,
            bottom_margin: 8,
            left_margin: 8,
            right_margin: 8,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
        });

        const scrolled = new Gtk.ScrolledWindow({
            min_content_height: 220,
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        scrolled.add_css_class('card');
        scrolled.set_child(textView);
        group.add(scrolled);

        // Ligne d'état + boutons.
        const statusRow = new Adw.ActionRow({
            title: 'JSON',
            subtitle: 'Modifié = enregistré automatiquement.',
        });

        const saveButton = new Gtk.Button({
            label: 'Enregistrer',
            valign: Gtk.Align.CENTER,
        });
        const resetButton = new Gtk.Button({
            label: 'Réinitialiser',
            valign: Gtk.Align.CENTER,
        });
        resetButton.add_css_class('destructive-action');

        const setStatus = (msg, error) => {
            statusRow.subtitle = msg;
            if (error)
                statusRow.add_css_class('error');
            else
                statusRow.remove_css_class('error');
        };

        const save = () => {
            const text = buffer.text.trim();
            if (text === '' || text === defaultJson.trim()) {
                settings.set_string('accents', '');
                setStatus('Table intégrée par défaut active.', false);
                return;
            }
            try {
                JSON.parse(text);
            } catch (e) {
                setStatus('JSON invalide — non enregistré : ' + e.message, true);
                return;
            }
            settings.set_string('accents', text);
            setStatus('Enregistré.', false);
        };

        saveButton.connect('clicked', save);

        // Sauvegarde automatique différée à la frappe.
        let saveTimer = 0;
        buffer.connect('changed', () => {
            if (saveTimer)
                GLib.source_remove(saveTimer);
            saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                saveTimer = 0;
                save();
                return GLib.SOURCE_REMOVE;
            });
        });

        resetButton.connect('clicked', () => {
            settings.set_string('accents', '');
            buffer.text = defaultJson;
            setStatus('Réinitialisé à la table intégrée.', false);
        });

        statusRow.add_suffix(saveButton);
        statusRow.add_suffix(resetButton);
        group.add(statusRow);
    }

    _readDefaultAccents() {
        try {
            const file = this.dir.get_child('accents.json');
            const [ok, bytes] = file.load_contents(null);
            if (ok) {
                const decoder = new TextDecoder('utf-8');
                return decoder.decode(bytes);
            }
        } catch (e) {
            // ignore
        }
        return '{}';
    }

    // ------------------------------------------------------------------ Claviers
    _buildLayoutsGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Claviers',
            description: 'Layouts où le raccourci est actif (aucun coché = tous actifs).',
        });
        page.add(group);

        let sources = [];
        try {
            const inputSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.input-sources',
            });
            // 'sources' est un a(ss) : (type, id) ; ex ('xkb','fr+oss').
            const variant = inputSettings.get_value('sources');
            const n = variant.n_children();
            for (let i = 0; i < n; i++) {
                const child = variant.get_child_value(i);
                const type = child.get_child_value(0).get_string()[0];
                const id = child.get_child_value(1).get_string()[0];
                if (type === 'xkb')
                    sources.push(id);
            }
        } catch (e) {
            sources = [];
        }

        // Dédoublonner.
        sources = [...new Set(sources)];

        if (sources.length === 0) {
            const empty = new Adw.ActionRow({
                title: 'Aucun layout xkb détecté',
                subtitle: 'Le raccourci est actif sur tous les claviers.',
            });
            group.add(empty);
            return;
        }

        const enabledLayouts = () => settings.get_strv('layouts');

        for (const id of sources) {
            const label = LAYOUT_LABELS[id] || id;
            const row = new Adw.SwitchRow({
                title: label,
                subtitle: id,
            });
            // Coché si présent dans layouts, OU si layouts est vide (tous activés).
            const current = enabledLayouts();
            row.active = current.length === 0 || current.includes(id);

            row.connect('notify::active', () => {
                let list = enabledLayouts();
                const allIds = sources;
                // Si la liste était vide (= tous), on la matérialise d'abord.
                if (list.length === 0)
                    list = [...allIds];

                const set = new Set(list);
                if (row.active)
                    set.add(id);
                else
                    set.delete(id);

                let next = allIds.filter(x => set.has(x));
                // Si tous sont cochés, revenir à liste vide (= tous, sémantique défaut).
                if (next.length === allIds.length)
                    next = [];
                settings.set_strv('layouts', next);
            });

            group.add(row);
        }
    }
}

// Déconnecte un handler de settings quand le widget racine est détruit,
// pour éviter de garder une référence morte.
function window_destroy_cleanup(widget, settings, handlerId) {
    widget.connect('destroy', () => {
        if (handlerId) {
            settings.disconnect(handlerId);
            handlerId = 0;
        }
    });
}
