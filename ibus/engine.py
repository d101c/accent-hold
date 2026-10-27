#!/usr/bin/env python3
"""Accent Hold IBus engine: true press-and-hold accents on GNOME (Wayland/X11).

Hold an accentable letter and the native IBus candidate list appears next to
the text cursor; pick a variant with the digit row, the arrows or the mouse.

The press-and-hold technique (stopping the held letter from repeating, and
using the native IBus lookup table) was first shown by Manuele Conti in
https://github.com/manux81/gnome-accent-hold. This is an independent
implementation for the Accent Hold project; instead of switching key repeat
off for the whole desktop, it marks only the accentable keys as
non-repeating in the keymap (see xkbrepeat.py).

Usage:
    engine.py --ibus          run as the IBus engine (started by ibus-daemon)
    engine.py --component     print the IBus component XML for this install
    engine.py --xkb-symbols   print the xkb symbols that stop accentable keys
                              repeating, for the configured layouts
"""

import json
import os
import signal
import sys
from xml.sax.saxutils import escape

import gi
gi.require_version('IBus', '1.0')
from gi.repository import Gio, GLib, IBus  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from holdcore import (  # noqa: E402
    MAX_LABELS, NAV_KEYS, HoldMachine, Key, load_table, parse_default_accents,
)
import xkbrepeat  # noqa: E402

VERSION = '1.0.0'
BUS_NAME = 'io.github.d101c.AccentHold'
ENGINE_PREFIX = 'accent-hold:'
EXT_UUID = 'accent-hold@griffit.gmail.com'
EXT_SCHEMA = 'org.gnome.shell.extensions.accent-hold'
INPUT_SOURCES_SCHEMA = 'org.gnome.desktop.input-sources'

HOLD_MS = int(os.environ.get('ACCENT_HOLD_MS', '400'))
# Time given to the application to process a forwarded BackSpace before the
# replacement is committed (a terminal round-trips it through the shell).
COMMIT_DELAY_MS = 120
BACKSPACE_KEYCODE = 14  # evdev KEY_BACKSPACE

MODIFIER_KEYS = {
    'Shift_L', 'Shift_R', 'Control_L', 'Control_R', 'Alt_L', 'Alt_R',
    'Meta_L', 'Meta_R', 'Super_L', 'Super_R', 'Hyper_L', 'Hyper_R',
    'Caps_Lock', 'Shift_Lock', 'Num_Lock', 'Scroll_Lock',
    'ISO_Level3_Shift', 'ISO_Level5_Shift', 'Mode_switch',
    'ISO_Next_Group', 'ISO_Prev_Group', 'Multi_key',
}
SHORTCUT_MASK = (IBus.ModifierType.CONTROL_MASK | IBus.ModifierType.MOD1_MASK |
                 IBus.ModifierType.MOD4_MASK | IBus.ModifierType.SUPER_MASK)


def log(message):
    print(f'accent-hold: {message}', file=sys.stderr, flush=True)


# -- settings ----------------------------------------------------------------

def extension_settings():
    """The extension's GSettings, shared with its preferences panel."""
    dirs = [
        os.path.join(GLib.get_user_data_dir(), 'gnome-shell', 'extensions', EXT_UUID, 'schemas'),
        *[os.path.join(d, 'gnome-shell', 'extensions', EXT_UUID, 'schemas')
          for d in GLib.get_system_data_dirs()],
        os.path.join(HERE, 'schemas'),
    ]
    default = Gio.SettingsSchemaSource.get_default()
    for d in dirs:
        if not os.path.exists(os.path.join(d, 'gschemas.compiled')):
            continue
        try:
            source = Gio.SettingsSchemaSource.new_from_directory(d, default, False)
        except GLib.Error:
            continue
        schema = source.lookup(EXT_SCHEMA, False)
        if schema:
            return Gio.Settings.new_full(schema, None, None)
    return None


def default_table():
    for path in (os.path.join(HERE, 'defaultAccents.js'),
                 os.path.join(HERE, '..', 'extension', 'defaultAccents.js')):
        try:
            with open(path, encoding='utf-8') as f:
                return parse_default_accents(f.read())
        except (OSError, ValueError):
            continue
    log('defaultAccents.js not found, no accents available')
    return {}


class AccentTable:
    def __init__(self):
        self._default = default_table()
        self._settings = extension_settings()
        self.table = self._load()
        if self._settings:
            self._settings.connect('changed::accents', self._reload)

    def _load(self):
        override = self._settings.get_string('accents') if self._settings else ''
        return load_table(override, self._default)

    def _reload(self, *_args):
        self.table = self._load()


# -- engine ------------------------------------------------------------------

class AccentHoldEngine(IBus.Engine):
    __gtype_name__ = 'AccentHoldEngine'

    def __init__(self, connection, object_path, table):
        super().__init__(connection=connection, object_path=object_path,
                         active_surrounding_text=True)
        self._table = table
        self._machine = HoldMachine(table.table)
        self._caps = 0
        self._hold_id = 0
        self._commit_id = 0
        self._lookup = None

    # -- IBus vfuncs ---------------------------------------------------------

    def do_process_key_event(self, keyval, keycode, state):
        key = self._key(keyval, keycode, state)
        if self._machine.state == 'idle':
            self._machine.table = self._table.table
        result = self._machine.key(key)
        self._run(result.actions)
        return result.consumed

    def do_focus_out(self):
        self._run(self._machine.cancel())

    def do_enable(self):
        self.get_surrounding_text()  # tells the client we want surrounding text

    def do_disable(self):
        self._run(self._machine.cancel())

    def do_reset(self):
        # Clients reset the context when the letter we forwarded gets
        # inserted, so a reset must not cancel a hold in progress.
        pass

    def do_set_capabilities(self, caps):
        self._caps = int(caps)

    def do_candidate_clicked(self, index, _button, _state):
        page_start = 0
        if self._lookup:
            size = self._lookup.get_page_size()
            page_start = self._lookup.get_cursor_pos() // size * size
        self._run(self._machine.candidate_clicked(page_start + index))

    def do_cursor_up(self):
        self._move(-1)

    def do_cursor_down(self):
        self._move(1)

    def do_page_up(self):
        self._move(-1)

    def do_page_down(self):
        self._move(1)

    def do_destroy(self):
        self._run(self._machine.cancel())
        self._cancel_commit()
        IBus.Engine.do_destroy(self)

    # -- key translation -----------------------------------------------------

    @staticmethod
    def _key(keyval, keycode, state):
        name = IBus.keyval_name(keyval) or ''
        char = IBus.keyval_to_unicode(keyval)
        if isinstance(char, int):
            char = chr(char) if char else ''
        if not char or not char.isprintable():
            char = ''
        keypad = -1
        if name.startswith('KP_') and name[3:].isdigit() and name[3:] != '0':
            keypad = int(name[3:]) - 1
        return Key(
            keyval=keyval,
            keycode=keycode,
            char=char,
            release=bool(state & IBus.ModifierType.RELEASE_MASK),
            shortcut=bool(state & SHORTCUT_MASK),
            modifier=name in MODIFIER_KEYS,
            name=name if name in NAV_KEYS else '',
            keypad_digit=keypad,
        )

    # -- actions -------------------------------------------------------------

    def _run(self, actions):
        for action in actions:
            kind = action[0]
            if kind == 'arm':
                self._cancel_hold()
                self._hold_id = GLib.timeout_add(HOLD_MS, self._hold_cb)
            elif kind == 'disarm':
                self._cancel_hold()
            elif kind == 'show':
                self._show(action[1], action[2])
            elif kind == 'move':
                if self._lookup:
                    self._lookup.set_cursor_pos(action[1])
                    self.update_lookup_table(self._lookup, True)
            elif kind == 'hide':
                self._lookup = None
                self.hide_lookup_table()
            elif kind == 'replace':
                self._replace(action[1], action[2])

    def _hold_cb(self):
        self._hold_id = 0
        self._run(self._machine.hold_elapsed())
        return GLib.SOURCE_REMOVE

    def _cancel_hold(self):
        if self._hold_id:
            GLib.source_remove(self._hold_id)
            self._hold_id = 0

    def _show(self, candidates, index):
        size = min(len(candidates), MAX_LABELS)
        table = IBus.LookupTable.new(size, index, True, True)
        table.set_orientation(IBus.Orientation.HORIZONTAL)
        for i, text in enumerate(candidates):
            table.append_candidate(IBus.Text.new_from_string(text))
        for i in range(size):
            table.set_label(i, IBus.Text.new_from_string(str(i + 1)))
        self._lookup = table
        self.update_lookup_table(table, True)

    def _move(self, step):
        if self._machine.state != 'open':
            return
        name = 'Right' if step > 0 else 'Left'
        self._run(self._machine.key(Key(keyval=0, keycode=0, name=name)).actions)

    # The letter was inserted by the application itself; delete it, then
    # commit the accented variant.
    def _replace(self, base, text):
        if self._can_delete_before_cursor(base):
            self.delete_surrounding_text(-1, 1)
            self.commit_text(IBus.Text.new_from_string(text))
            return
        self.forward_key_event(IBus.KEY_BackSpace, BACKSPACE_KEYCODE, 0)
        self.forward_key_event(IBus.KEY_BackSpace, BACKSPACE_KEYCODE,
                               IBus.ModifierType.RELEASE_MASK)
        self._cancel_commit()
        self._commit_id = GLib.timeout_add(COMMIT_DELAY_MS, self._commit_cb, text)

    def _can_delete_before_cursor(self, base):
        # Only trust surrounding text when it shows our letter right before
        # the cursor: some clients report support but ignore deletions.
        if not self._caps & int(IBus.Capabilite.SURROUNDING_TEXT):
            return False
        try:
            text, cursor, anchor = self.get_surrounding_text()
            value = text.get_text() if text else ''
        except (TypeError, ValueError):
            return False
        return cursor == anchor and 0 < cursor <= len(value) and value[cursor - 1] == base

    def _commit_cb(self, text):
        self._commit_id = 0
        self.commit_text(IBus.Text.new_from_string(text))
        return GLib.SOURCE_REMOVE

    def _cancel_commit(self):
        if self._commit_id:
            GLib.source_remove(self._commit_id)
            self._commit_id = 0


class AccentHoldFactory(IBus.Factory):
    __gtype_name__ = 'AccentHoldFactory'

    def __init__(self, bus, table):
        super().__init__(connection=bus.get_connection(),
                         object_path=IBus.PATH_FACTORY)
        self._bus = bus
        self._table = table
        self._count = 0

    def do_create_engine(self, name):
        if not name.startswith(ENGINE_PREFIX):
            return None
        self._count += 1
        return AccentHoldEngine(self._bus.get_connection(),
                                f'/io/github/d101c/AccentHold/Engine/{self._count}',
                                self._table)


# -- component XML -----------------------------------------------------------

def xkb_layouts():
    """xkb layouts configured in GNOME, e.g. ['fr', 'us', 'de+nodeadkeys'].

    Layouts already wrapped in one of our engines count as their layout.
    """
    try:
        sources = Gio.Settings.new(INPUT_SOURCES_SCHEMA).get_value('sources').unpack()
    except Exception:
        sources = []
    layouts = []
    for kind, ident in sources:
        # After `install.sh --replace` the layouts only appear through our
        # own engines (accent-hold:fr, ...).
        if kind == 'ibus' and ident.startswith(ENGINE_PREFIX):
            ident = ident[len(ENGINE_PREFIX):]
        elif kind != 'xkb':
            continue
        if ident not in layouts:
            layouts.append(ident)
    return layouts or ['us']


def layout_info(xkb_id):
    layout, _, variant = xkb_id.partition('+')
    display, short, language = xkb_id, layout, layout
    try:
        gi.require_version('GnomeDesktop', '4.0')
        from gi.repository import GnomeDesktop
        info = GnomeDesktop.XkbInfo()
        found, display, short, _l, _v = info.get_layout_info(xkb_id)
        if not found:
            display, short = xkb_id, layout
        languages = info.get_languages_for_layout(xkb_id)
        if languages:
            language = languages[0]
    except (ValueError, ImportError):
        pass
    return layout, variant, display, short, language


def component_xml(exec_path):
    engines = []
    for xkb_id in xkb_layouts():
        layout, variant, display, short, language = layout_info(xkb_id)
        longname = f'Accent Hold, {display}' if variant else 'Accent Hold'
        engines.append(f'''    <engine>
      <name>{escape(ENGINE_PREFIX + xkb_id)}</name>
      <longname>{escape(longname)}</longname>
      <description>{escape(display)} with press-and-hold accents</description>
      <language>{escape(language)}</language>
      <license>GPL-2.0-or-later</license>
      <author>Julien Griffit</author>
      <layout>{escape(layout)}</layout>
      <layout_variant>{escape(variant)}</layout_variant>
      <symbol>{escape(short)}</symbol>
      <rank>0</rank>
    </engine>''')
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by engine.py --component; re-run the installer after adding a keyboard layout. -->
<component>
  <name>{BUS_NAME}</name>
  <description>Accent Hold: press-and-hold accents</description>
  <exec>{escape(sys.executable)} {escape(exec_path)} --ibus</exec>
  <version>{VERSION}</version>
  <author>Julien Griffit</author>
  <license>GPL-2.0-or-later</license>
  <homepage>https://github.com/d101c/accent-hold</homepage>
  <textdomain>accent-hold</textdomain>
  <engines>
{chr(10).join(engines)}
  </engines>
</component>
'''


# -- main --------------------------------------------------------------------

def run_engine():
    IBus.init()
    bus = IBus.Bus()
    if not bus.is_connected():
        log(f"cannot connect to IBus (IBUS_ADDRESS={os.environ.get('IBUS_ADDRESS', 'unset')})")
        return 1
    loop = GLib.MainLoop()
    table = AccentTable()
    factory = AccentHoldFactory(bus, table)  # noqa: F841 (kept alive)

    def quit_(*_args):
        loop.quit()
        return GLib.SOURCE_REMOVE

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        GLib.unix_signal_add(GLib.PRIORITY_HIGH, sig, quit_)  # noqa (GLibUnix needs GLib 2.86)
    bus.connect('disconnected', quit_)
    bus.request_name(BUS_NAME, 0)
    log(f'ready ({len(table.table)} accentable keys, hold {HOLD_MS} ms)')
    loop.run()
    return 0


def main(argv):
    if '--component' in argv:
        sys.stdout.write(component_xml(os.path.abspath(__file__)))
        return 0
    if '--xkb-symbols' in argv:
        chars = set(AccentTable().table)
        sys.stdout.write(xkbrepeat.symbols(xkbrepeat.accent_keys(xkb_layouts(), chars)))
        return 0
    if '--list-table' in argv:
        print(json.dumps(AccentTable().table, ensure_ascii=False, indent=1))
        return 0
    return run_engine()


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
