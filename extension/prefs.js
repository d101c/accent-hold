import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {DEFAULT_ACCENTS, formatTable, parseTable} from './defaultAccents.js';
import {BUILTIN_PRESETS, builtinTable, serializePreset, parsePresetFile,
    parseUserPresets, sameTable} from './presets.js';

const SHORTCUT_KEY = 'accent-hold-shortcut';

// A shortcut must not hijack an ordinary key: it needs a modifier other than
// Shift or Caps Lock (Shift+e is just E), or a function key.
function shortcutAcceptable(keyval, mods) {
    const strong = mods & ~(Gdk.ModifierType.SHIFT_MASK | Gdk.ModifierType.LOCK_MASK);
    if (strong !== 0)
        return true;
    return keyval >= Gdk.KEY_F1 && keyval <= Gdk.KEY_F35;
}

// Readable labels for a few common xkb layouts; unknown ids fall back to the raw
// id. A function (not a const) so _() runs on use, after the gettext domain is
// resolved, rather than at module import time.
function layoutLabels() {
    return {
        'fr': _('French (fr)'),
        'fr+oss': _('French (oss variant)'),
        'us': _('English US (us)'),
        'us+intl': _('English US International'),
        'gb': _('English GB (gb)'),
        'de': _('German (de)'),
        'es': _('Spanish (es)'),
        'it': _('Italian (it)'),
        'pt': _('Portuguese (pt)'),
        'be': _('Belgian (be)'),
        'ch': _('Swiss (ch)'),
        'ca': _('Canadian (ca)'),
    };
}

// Fill the %s of an already translated string. Plain replace: String.format
// is not guaranteed to exist in the preferences process.
function fmt(text, arg) {
    return text.replace('%s', () => String(arg));
}

export default class AccentHoldPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('Accent Hold'),
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        });
        window.add(page);

        this._buildHoldGroup(page, settings);
        this._buildShortcutGroup(page, settings);
        this._buildBehaviorGroup(page, settings);
        this._buildAccentsGroup(page, settings, window);
        this._buildLayoutsGroup(page, settings);
        this._buildFamilyGroup(page);
    }

    // Accent Hold needs nothing installed. Its sibling does, and carries an
    // Installation page of its own.
    _buildFamilyGroup(page) {
        const group = new Adw.PreferencesGroup({
            title: _('More from the Hold family'),
            description: _('Same gesture, same look. It installs its engine from its own settings, without a terminal.'),
        });
        page.add(group);
        for (const [title, subtitle, url] of [
            [_('Voice Hold'), _('Hold a key and dictate, offline.'), 'https://extensions.gnome.org/extension/11610/voice-hold/'],
        ]) {
            const row = new Adw.ActionRow({title, subtitle, activatable: true});
            row.add_suffix(new Gtk.Image({icon_name: 'external-link-symbolic', valign: Gtk.Align.CENTER}));
            row.connect('activated', () => Gtk.show_uri(row.get_root(), url, Gdk.CURRENT_TIME));
            group.add(row);
        }
    }

    _buildHoldGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Press and hold'),
            description: _('Hold a letter to choose its accent: press its number, or move with the arrows and press Enter, or click. Space keeps the plain letter.'),
        });
        page.add(group);

        const holdRow = new Adw.SwitchRow({
            title: _('Enabled'),
            subtitle: _('Works in applications that support the GNOME input method.'),
        });
        group.add(holdRow);
        settings.bind('press-and-hold', holdRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const durationRow = new Adw.SpinRow({
            title: _('Hold duration'),
            subtitle: _('Milliseconds a letter must be held.'),
            adjustment: new Gtk.Adjustment({
                lower: 200,
                upper: 1500,
                step_increment: 50,
                page_increment: 100,
            }),
        });
        group.add(durationRow);
        settings.bind('hold-ms', durationRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        const releaseRow = new Adw.SwitchRow({
            title: _('Pick on release'),
            subtitle: _('Releasing the letter picks the highlighted variant.'),
        });
        group.add(releaseRow);
        settings.bind('pick-on-release', releaseRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }

    _buildShortcutGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Shortcut'),
            description: _('Key that triggers the accent picker.'),
        });
        page.add(group);

        const enabledRow = new Adw.SwitchRow({
            title: _('Enabled'),
            subtitle: _('Enable or disable the shortcut.'),
        });
        group.add(enabledRow);
        settings.bind('enabled', enabledRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // Capture button: click, then press the combination.
        const defaultHint = _('Click the button, then press the combination.');
        const triggerRow = new Adw.ActionRow({
            title: _('Combination'),
            subtitle: defaultHint,
        });
        const setHint = (msg, error) => {
            triggerRow.subtitle = msg;
            if (error)
                triggerRow.add_css_class('error');
            else
                triggerRow.remove_css_class('error');
        };
        const rejectHint = _('Use a modifier (Ctrl, Alt, Super…) or a function key.');

        const button = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            has_frame: true,
        });

        const accelLabel = (arr) => {
            const a = arr && arr.length ? arr[0] : '';
            return a ? a : _('Disabled');
        };
        const refreshButton = () => {
            button.label = accelLabel(settings.get_strv(SHORTCUT_KEY));
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
            button.label = _('Press a key…');
            button.grab_focus();
        });

        keyController.connect('key-pressed', (_c, keyval, _keycode, state) => {
            if (!capturing)
                return Gdk.EVENT_PROPAGATE;

            // Escape cancels; Backspace/Delete clears.
            if (keyval === Gdk.KEY_Escape) {
                stopCapture();
                return Gdk.EVENT_STOP;
            }
            if (keyval === Gdk.KEY_BackSpace || keyval === Gdk.KEY_Delete) {
                settings.set_strv(SHORTCUT_KEY, []);
                stopCapture();
                return Gdk.EVENT_STOP;
            }

            if (this._isModifierKey(keyval))
                return Gdk.EVENT_STOP;

            const mask = state & Gtk.accelerator_get_default_mod_mask();
            if (!Gtk.accelerator_valid(keyval, mask))
                return Gdk.EVENT_STOP;

            // A bare letter is a valid accelerator for GTK but would open
            // the picker on every press of that letter: refuse it.
            if (!shortcutAcceptable(keyval, mask)) {
                setHint(rejectHint, true);
                stopCapture();
                return Gdk.EVENT_STOP;
            }
            setHint(defaultHint, false);
            settings.set_strv(SHORTCUT_KEY, [Gtk.accelerator_name(keyval, mask)]);
            stopCapture();
            return Gdk.EVENT_STOP;
        });

        triggerRow.add_suffix(button);
        triggerRow.activatable_widget = button;
        group.add(triggerRow);

        // Text fallback: type the accelerator by hand.
        const entryRow = new Adw.EntryRow({
            title: _('Accelerator (text)'),
        });
        const syncEntry = () => {
            const arr = settings.get_strv(SHORTCUT_KEY);
            entryRow.text = arr && arr.length ? arr[0] : '';
        };
        syncEntry();
        entryRow.connect('apply', () => {
            const txt = entryRow.text.trim();
            if (txt === '') {
                settings.set_strv(SHORTCUT_KEY, []);
                return;
            }
            // Only store what parses and passes the same rule as the
            // capture; otherwise put the stored value back in the entry.
            const [ok, keyval, mods] = Gtk.accelerator_parse(txt);
            if (!ok || !Gtk.accelerator_valid(keyval, mods) || !shortcutAcceptable(keyval, mods)) {
                setHint(rejectHint, true);
                syncEntry();
                return;
            }
            setHint(defaultHint, false);
            settings.set_strv(SHORTCUT_KEY, [Gtk.accelerator_name(keyval, mods)]);
        });
        group.add(entryRow);

        const changedId = settings.connect(`changed::${SHORTCUT_KEY}`, () => {
            refreshButton();
            syncEntry();
        });
        disconnectOnDestroy(group, settings, changedId);
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

    _buildBehaviorGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Behavior'),
        });
        page.add(group);

        const delayRow = new Adw.SpinRow({
            title: _('Delay before display'),
            subtitle: _('Milliseconds before the shortcut picker appears (press and hold is not delayed).'),
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
            title: _('Auto-close (failsafe)'),
            subtitle: _('Milliseconds before automatic close.'),
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

        const indicatorRow = new Adw.SwitchRow({
            title: _('Top bar icon'),
            subtitle: _('Show an icon with a quick on/off switch and a link to these settings. Bring it back here after hiding it from its menu.'),
        });
        group.add(indicatorRow);
        settings.bind('show-indicator', indicatorRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }

    _buildAccentsGroup(page, settings, window) {
        const defaultJson = formatTable(DEFAULT_ACCENTS);

        const buffer = new Gtk.TextBuffer();
        const loadFromSettings = () => {
            const stored = settings.get_string('accents');
            buffer.text = stored && stored.trim() !== '' ? stored : defaultJson;
        };
        loadFromSettings();

        // Status line shared by the group below and the large editor window.
        const statusListeners = [];
        let lastStatus = [_('Modified = saved automatically.'), false];
        const setStatus = (msg, error) => {
            lastStatus = [msg, error];
            for (const fn of statusListeners)
                fn(msg, error);
        };

        // ---- Presets ------------------------------------------------------
        this._buildPresetsGroup(page, settings, window, buffer, setStatus);

        // ---- Table editor -------------------------------------------------
        const group = new Adw.PreferencesGroup({
            title: _('Accentable characters'),
            description: _('JSON table: base letter → list of accented variants.'),
        });
        page.add(group);

        const makeTextView = () => new Gtk.TextView({
            buffer: buffer,
            monospace: true,
            top_margin: 8,
            bottom_margin: 8,
            left_margin: 8,
            right_margin: 8,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
        });

        const scrolled = new Gtk.ScrolledWindow({
            min_content_height: 360,
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        scrolled.add_css_class('card');
        scrolled.set_child(makeTextView());
        group.add(scrolled);

        const statusRow = new Adw.ActionRow({
            title: 'JSON',
            subtitle: lastStatus[0],
        });
        statusListeners.push((msg, error) => {
            statusRow.subtitle = msg;
            if (error)
                statusRow.add_css_class('error');
            else
                statusRow.remove_css_class('error');
        });

        const saveButton = new Gtk.Button({
            label: _('Save'),
            valign: Gtk.Align.CENTER,
        });
        const resetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        resetButton.add_css_class('destructive-action');
        const largeButton = new Gtk.Button({
            icon_name: 'view-fullscreen-symbolic',
            tooltip_text: _('Edit in a larger window'),
            valign: Gtk.Align.CENTER,
        });
        largeButton.add_css_class('flat');

        const save = () => {
            const text = buffer.text.trim();
            if (text === '' || text === defaultJson.trim()) {
                settings.set_string('accents', '');
                setStatus(_('Built-in default table active.'), false);
                return;
            }
            if (parseTable(text) === null) {
                setStatus(_('Not saved: expected {"e": ["é", "è"], …} — an object of string lists.'), true);
                return;
            }
            settings.set_string('accents', text);
            setStatus(_('Saved.'), false);
        };

        saveButton.connect('clicked', save);

        // Debounced auto-save while typing.
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
        // Closing the window within the debounce: save now rather than
        // leaving a timeout behind (or losing the edit).
        window.connect('close-request', () => {
            if (saveTimer) {
                GLib.source_remove(saveTimer);
                saveTimer = 0;
                save();
            }
            return false;
        });

        resetButton.connect('clicked', () => {
            settings.set_string('accents', '');
            buffer.text = defaultJson;
            setStatus(_('Reset to the built-in table.'), false);
        });

        // A roomy editor: same buffer, so both views stay in sync and the
        // debounced save above covers either one.
        largeButton.connect('clicked', () => {
            const big = new Adw.Window({
                title: _('Accentable characters'),
                modal: true,
                transient_for: window,
                default_width: 860,
                default_height: 680,
            });
            const toolbar = new Adw.ToolbarView();
            toolbar.add_top_bar(new Adw.HeaderBar());
            const body = new Gtk.ScrolledWindow({
                hexpand: true,
                vexpand: true,
                hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            });
            body.set_child(makeTextView());
            toolbar.set_content(body);

            const bar = new Gtk.Label({
                label: lastStatus[0],
                xalign: 0,
                wrap: true,
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 12,
                margin_end: 12,
            });
            bar.add_css_class('dim-label');
            toolbar.add_bottom_bar(bar);
            const listener = (msg, error) => {
                bar.label = msg;
                if (error)
                    bar.add_css_class('error');
                else
                    bar.remove_css_class('error');
            };
            statusListeners.push(listener);
            big.connect('close-request', () => {
                const i = statusListeners.indexOf(listener);
                if (i >= 0)
                    statusListeners.splice(i, 1);
                return false;
            });

            const keys = new Gtk.EventControllerKey();
            keys.connect('key-pressed', (_c, keyval) => {
                if (keyval !== Gdk.KEY_Escape)
                    return Gdk.EVENT_PROPAGATE;
                big.close();
                return Gdk.EVENT_STOP;
            });
            big.add_controller(keys);

            big.set_content(toolbar);
            big.present();
        });

        statusRow.add_suffix(largeButton);
        statusRow.add_suffix(saveButton);
        statusRow.add_suffix(resetButton);
        group.add(statusRow);
    }

    // Ready-made tables, your own saved ones, and files to share them.
    // Loading a preset only fills the editor: the editor's own auto-save
    // stores it, so there is a single path from text to setting.
    _buildPresetsGroup(page, settings, window, buffer, setStatus) {
        const group = new Adw.PreferencesGroup({
            title: _('Presets'),
            description: _('Start from a ready-made table, keep your own, or share them as files. You can still edit the table afterwards.'),
        });
        page.add(group);

        const labels = {
            all: _('Built-in (all languages)'),
            french: _('French'),
            spanish: _('Spanish'),
            portuguese: _('Portuguese'),
            italian: _('Italian'),
            german: _('German'),
            nordic: _('Nordic (Danish, Norwegian, Swedish, Icelandic)'),
            polish: _('Polish'),
            czech: _('Czech and Slovak'),
            turkish: _('Turkish'),
            romanian: _('Romanian'),
            typography: _('Typography, currency and math symbols'),
        };

        const readUser = () => parseUserPresets(settings.get_string('user-presets'));
        const writeUser = (map) => settings.set_string('user-presets', JSON.stringify(map));

        // Rows of the list: [{label, table, user: name|null}]
        let entries = [];
        const combo = new Adw.ComboRow({
            title: _('Preset'),
            subtitle: _('Replaces the table below.'),
        });
        const loadButton = new Gtk.Button({label: _('Load'), valign: Gtk.Align.CENTER});
        loadButton.add_css_class('suggested-action');
        const deleteButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            tooltip_text: _('Delete this saved preset'),
            valign: Gtk.Align.CENTER,
            visible: false,
        });
        deleteButton.add_css_class('flat');
        combo.add_suffix(deleteButton);
        combo.add_suffix(loadButton);

        const rebuild = (selectName = null) => {
            const user = readUser();
            entries = BUILTIN_PRESETS.map(p => ({
                label: labels[p.id] ?? p.id,
                table: builtinTable(p.id),
                user: null,
            }));
            for (const name of Object.keys(user).sort((a, b) => a.localeCompare(b)))
                entries.push({label: name, table: user[name], user: name});
            combo.model = Gtk.StringList.new(entries.map(e => e.user
                ? `${e.label}  ·  ${_('saved')}` : e.label));
            const at = selectName === null ? -1 : entries.findIndex(e => e.user === selectName);
            combo.selected = at >= 0 ? at : 0;
        };

        const selectedEntry = () => entries[combo.selected] ?? null;
        combo.connect('notify::selected', () => {
            deleteButton.visible = !!selectedEntry()?.user;
        });

        // The table in the editor, or null when it is not valid JSON-table text.
        const currentTable = () => {
            const text = buffer.text.trim();
            return text === '' ? DEFAULT_ACCENTS : parseTable(text);
        };
        // Would loading something else throw away work that is saved nowhere?
        const hasUnsavedWork = () => {
            const cur = currentTable();
            if (cur === null)
                return true;
            return !entries.some(e => sameTable(e.table, cur));
        };

        const confirmReplace = (then) => {
            if (!hasUnsavedWork()) {
                then();
                return;
            }
            const dialog = new Gtk.AlertDialog({
                message: _('Replace the current table?'),
                detail: _('Your edits are not saved as a preset. Export or save them first if you want to keep them.'),
                buttons: [_('Cancel'), _('Replace')],
                cancel_button: 0,
                default_button: 0,
            });
            dialog.choose(window, null, (d, res) => {
                let index = 0;
                try {
                    index = d.choose_finish(res);
                } catch {
                    return;
                }
                if (index === 1)
                    then();
            });
        };

        const apply = (label, table) => {
            buffer.text = formatTable(table);
            setStatus(fmt(_('Preset “%s” loaded.'), label), false);
        };

        loadButton.connect('clicked', () => {
            const entry = selectedEntry();
            if (!entry)
                return;
            confirmReplace(() => apply(entry.label, entry.table));
        });

        deleteButton.connect('clicked', () => {
            const entry = selectedEntry();
            if (!entry?.user)
                return;
            const user = readUser();
            delete user[entry.user];
            writeUser(user);
            rebuild();
            setStatus(fmt(_('Preset “%s” deleted.'), entry.user), false);
        });

        group.add(combo);

        // ---- Save the current table under a name --------------------------
        const nameRow = new Adw.EntryRow({
            title: _('Save the current table as a preset'),
            show_apply_button: true,
        });
        nameRow.connect('apply', () => {
            const name = nameRow.text.trim();
            if (name === '')
                return;
            const table = currentTable();
            if (table === null) {
                setStatus(_('Not saved: the table below is not valid yet.'), true);
                return;
            }
            const user = readUser();
            const existed = Object.hasOwn(user, name);
            user[name] = table;
            writeUser(user);
            nameRow.text = '';
            rebuild(name);
            setStatus(existed
                ? fmt(_('Preset “%s” updated.'), name)
                : fmt(_('Preset “%s” saved.'), name), false);
        });
        group.add(nameRow);

        // ---- Files --------------------------------------------------------
        const fileRow = new Adw.ActionRow({
            title: _('Share'),
            subtitle: _('A preset file is plain JSON: send it, or import one someone sent you.'),
        });
        const importButton = new Gtk.Button({label: _('Import…'), valign: Gtk.Align.CENTER});
        const exportButton = new Gtk.Button({label: _('Export…'), valign: Gtk.Align.CENTER});
        fileRow.add_suffix(importButton);
        fileRow.add_suffix(exportButton);
        group.add(fileRow);

        const jsonFilter = () => {
            const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
            const f = new Gtk.FileFilter({name: 'JSON'});
            f.add_suffix('json');
            f.add_mime_type('application/json');
            filters.append(f);
            return filters;
        };

        importButton.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({
                title: _('Import a preset'),
                filters: jsonFilter(),
            });
            dialog.open(window, null, (d, res) => {
                let file;
                try {
                    file = d.open_finish(res);
                } catch {
                    return; // cancelled
                }
                file.load_contents_async(null, (f, loadRes) => {
                    let bytes;
                    try {
                        [, bytes] = f.load_contents_finish(loadRes);
                    } catch (e) {
                        setStatus(_('Could not read the file.'), true);
                        return;
                    }
                    const parsed = parsePresetFile(new TextDecoder().decode(bytes));
                    if (parsed === null) {
                        setStatus(_('Not a preset: expected {"name": "…", "accents": {"e": ["é"], …}} or a plain table.'), true);
                        return;
                    }
                    const fallback = (f.get_basename() ?? '').replace(/\.json$/i, '');
                    const name = parsed.name || fallback || _('Imported preset');
                    const user = readUser();
                    user[name] = parsed.table;
                    writeUser(user);
                    rebuild(name);
                    confirmReplace(() => apply(name, parsed.table));
                });
            });
        });

        exportButton.connect('clicked', () => {
            const table = currentTable();
            if (table === null) {
                setStatus(_('Nothing exported: the table below is not valid yet.'), true);
                return;
            }
            const entry = selectedEntry();
            const typed = nameRow.text.trim();
            const name = typed || (entry && sameTable(entry.table, table) ? entry.label : _('My accents'));
            const dialog = new Gtk.FileDialog({
                title: _('Export the table'),
                initial_name: `${name.replace(/[\\/:*?"<>|]/g, '-')}.json`,
                filters: jsonFilter(),
            });
            dialog.save(window, null, (d, res) => {
                let file;
                try {
                    file = d.save_finish(res);
                } catch {
                    return; // cancelled
                }
                const data = new TextEncoder().encode(serializePreset(name, table));
                file.replace_contents_bytes_async(new GLib.Bytes(data), null, false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, writeRes) => {
                        try {
                            f.replace_contents_finish(writeRes);
                            setStatus(fmt(_('Exported to %s.'), f.get_path() ?? f.get_uri()), false);
                        } catch (e) {
                            setStatus(_('Could not write the file.'), true);
                        }
                    });
            });
        });

        const changedId = settings.connect('changed::user-presets', () => rebuild(selectedEntry()?.user ?? null));
        disconnectOnDestroy(group, settings, changedId);

        rebuild();
    }

    _buildLayoutsGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Keyboards'),
            description: _('Layouts where press and hold and the shortcut are active (none checked = all active).'),
        });
        page.add(group);

        let sources = [];
        const inputSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.input-sources',
        });
        // 'sources' is an a(ss) of (type, id), e.g. ('xkb', 'fr+oss').
        const variant = inputSettings.get_value('sources');
        const n = variant.n_children();
        for (let i = 0; i < n; i++) {
            const child = variant.get_child_value(i);
            const type = child.get_child_value(0).get_string()[0];
            const id = child.get_child_value(1).get_string()[0];
            if (type === 'xkb')
                sources.push(id);
        }

        sources = [...new Set(sources)];

        if (sources.length === 0) {
            const empty = new Adw.ActionRow({
                title: _('No xkb layout detected'),
                subtitle: _('Accent Hold is active on all keyboards.'),
            });
            group.add(empty);
            return;
        }

        const enabledLayouts = () => settings.get_strv('layouts');
        const labels = layoutLabels();

        for (const id of sources) {
            const label = labels[id] || id;
            const row = new Adw.SwitchRow({
                title: label,
                subtitle: id,
            });
            // Checked when listed in `layouts`, or when `layouts` is empty (all on).
            const current = enabledLayouts();
            row.active = current.length === 0 || current.includes(id);

            row.connect('notify::active', () => {
                let list = enabledLayouts();
                const allIds = sources;
                // Materialize the implicit "all" list before editing it.
                if (list.length === 0)
                    list = [...allIds];

                const set = new Set(list);
                if (row.active)
                    set.add(id);
                else
                    set.delete(id);

                let next = allIds.filter(x => set.has(x));
                // All checked => empty list (the "all" default).
                if (next.length === allIds.length)
                    next = [];
                settings.set_strv('layouts', next);
            });

            group.add(row);
        }
    }
}

// Disconnect a settings handler when the widget is destroyed.
function disconnectOnDestroy(widget, settings, handlerId) {
    widget.connect('destroy', () => {
        if (handlerId) {
            settings.disconnect(handlerId);
            handlerId = 0;
        }
    });
}
