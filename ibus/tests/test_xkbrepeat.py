import ctypes
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import xkbrepeat  # noqa: E402

CHARS = set('aAeEcC')


def test_accent_keys_follow_the_layout():
    assert xkbrepeat.accent_keys(['us'], CHARS) == ['AB03', 'AC01', 'AD03']
    # AZERTY: a is on the top row
    assert 'AD01' in xkbrepeat.accent_keys(['fr'], CHARS)
    assert xkbrepeat.accent_keys(['fr', 'us'], CHARS) == ['AB03', 'AC01', 'AD01', 'AD03']


def test_unknown_layout_is_skipped():
    assert xkbrepeat.accent_keys(['no-such-layout', 'us'], CHARS) == ['AB03', 'AC01', 'AD03']


def test_option_stops_only_accent_keys_repeating(tmp_path):
    (tmp_path / 'rules').mkdir()
    (tmp_path / 'symbols').mkdir()
    (tmp_path / 'rules' / 'evdev').write_text(xkbrepeat.RULES)
    (tmp_path / 'symbols' / xkbrepeat.SYMBOLS_NAME).write_text(
        xkbrepeat.symbols(xkbrepeat.accent_keys(['us'], CHARS)))

    xkb = xkbrepeat._xkb()
    xkb.xkb_context_include_path_append.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    xkb.xkb_context_include_path_append_default.argtypes = [ctypes.c_void_p]
    xkb.xkb_keymap_key_by_name.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    xkb.xkb_keymap_key_by_name.restype = ctypes.c_uint32
    xkb.xkb_keymap_key_repeats.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    ctx = xkb.xkb_context_new(1)  # no default include paths: ours first
    xkb.xkb_context_include_path_append(ctx, str(tmp_path).encode())
    xkb.xkb_context_include_path_append_default(ctx)
    names = xkbrepeat._Names(b'evdev', b'pc105', b'us', b'', xkbrepeat.OPTION.encode())
    keymap = xkb.xkb_keymap_new_from_names(ctx, ctypes.byref(names), 0)
    assert keymap

    def repeats(name):
        return bool(xkb.xkb_keymap_key_repeats(keymap, xkb.xkb_keymap_key_by_name(keymap, name.encode())))

    assert not repeats('AC01') and not repeats('AD03')
    assert repeats('AD01') and repeats('LEFT') and repeats('BKSP') and repeats('VOL+')
    # the keys still type their letters
    assert 'a' in xkbrepeat._types(xkb, keymap, xkb.xkb_keymap_key_by_name(keymap, b'AC01'))
    xkb.xkb_keymap_unref(keymap)
    xkb.xkb_context_unref(ctx)
