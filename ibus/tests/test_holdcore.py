import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from holdcore import (  # noqa: E402
    ARMED, IDLE, OPEN, HoldMachine, Key, load_table, parse_default_accents,
)

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TABLE = {'e': ['é', 'è', 'ê'], 'E': ['É', 'È']}

# keyvals (X keysyms) and evdev keycodes used below
E, E_UP, X, SHIFT, BKSP = 0x65, 0x45, 0x78, 0xffe1, 0xff08
KC_E, KC_X, KC_SHIFT, KC_BKSP, KC_ESC, KC_RIGHT, KC_ENTER = 18, 45, 42, 14, 1, 106, 28


def press(keyval, keycode, char='', **kw):
    return Key(keyval, keycode, char, **kw)


def release(keyval, keycode, char='', **kw):
    return Key(keyval, keycode, char, release=True, **kw)


def digit(n):
    # Digit row by keycode, keyval of the AZERTY unshifted symbol
    return press(0x26, 1 + n)


def opened(table=TABLE, char='e', keyval=E):
    m = HoldMachine(table)
    m.key(press(keyval, KC_E, char))
    m.hold_elapsed()
    return m


def test_tap_forwards_letter_and_disarms():
    m = HoldMachine(TABLE)
    r = m.key(press(E, KC_E, 'e'))
    assert not r.consumed and ('arm',) in r.actions and m.state == ARMED
    r = m.key(release(E, KC_E, 'e'))
    assert not r.consumed and r.actions == [('disarm',)] and m.state == IDLE


def test_hold_opens_candidates():
    m = opened()
    assert m.state == OPEN and m.candidates == TABLE['e']


def test_digit_row_selects_by_keycode_on_any_layout():
    m = opened()
    r = m.key(digit(2))
    assert r.consumed
    assert r.actions == [('hide',), ('replace', 'e', 'è')]
    assert m.state == IDLE


def test_digit_out_of_range_is_ignored():
    m = opened()
    r = m.key(digit(9))
    assert r.consumed and r.actions == [] and m.state == OPEN


def test_keypad_digit_selects():
    m = opened()
    r = m.key(press(0xffb3, 81, keypad_digit=2))
    assert r.actions[-1] == ('replace', 'e', 'ê')


def test_arrows_wrap_and_enter_confirms():
    m = opened()
    assert m.key(press(0xff53, KC_RIGHT, name='Right')).actions == [('move', 1)]
    assert m.key(press(0xff51, 105, name='Left')).actions == [('move', 0)]
    assert m.key(press(0xff51, 105, name='Left')).actions == [('move', 2)]
    r = m.key(press(0xff0d, KC_ENTER, name='Return'))
    assert r.actions[-1] == ('replace', 'e', 'ê')


def test_escape_keeps_plain_letter():
    m = opened()
    r = m.key(press(0xff1b, KC_ESC, name='Escape'))
    assert r.consumed and r.actions == [('hide',)] and m.state == IDLE


def test_held_letter_release_is_forwarded_but_repeat_swallowed():
    m = opened()
    assert m.key(press(E, KC_E, 'e')).consumed
    assert not m.key(release(E, KC_E, 'e')).consumed
    assert m.state == OPEN


def test_other_key_closes_and_types_normally():
    m = opened()
    r = m.key(press(X, KC_X, 'x'))
    assert not r.consumed
    assert r.actions[0] == ('hide',)
    assert ('repeat_start', press(X, KC_X, 'x')) in r.actions
    assert m.state == IDLE


def test_backspace_closes_and_deletes_letter_natively():
    m = opened()
    r = m.key(press(BKSP, KC_BKSP, name='BackSpace'))
    assert not r.consumed and r.actions[0] == ('hide',)


def test_other_accentable_key_rearms():
    m = opened()
    r = m.key(press(E, KC_E, 'e'))  # same keyval -> repeat, swallowed
    assert r.consumed
    m = HoldMachine({'e': ['é'], 'a': ['à']})
    m.key(press(E, KC_E, 'e'))
    r = m.key(press(0x61, 16, 'a'))
    assert r.actions[0] == ('disarm',) and ('arm',) in r.actions
    assert m.base == 'a'


def test_selection_key_releases_are_consumed():
    m = opened()
    m.key(press(0xff53, KC_RIGHT, name='Right'))
    assert m.key(release(0xff53, KC_RIGHT, name='Right')).consumed
    assert not m.key(release(SHIFT, KC_SHIFT, modifier=True)).consumed


def test_shift_held_gives_uppercase_candidates():
    m = HoldMachine(TABLE)
    m.key(press(SHIFT, KC_SHIFT, modifier=True))
    m.key(press(E_UP, KC_E, 'E'))
    assert m.hold_elapsed() == [('show', ['É', 'È'], 0)]
    # Shift + digit row still selects by position
    r = m.key(press(0x32, 3))
    assert r.actions[-1] == ('replace', 'E', 'È')


def test_shortcuts_never_arm_and_repeat():
    m = HoldMachine(TABLE)
    k = press(E, KC_E, 'e', shortcut=True)
    r = m.key(k)
    assert not r.consumed and r.actions == [('repeat_start', k)]
    assert m.state == IDLE


def test_non_accentable_keys_repeat_engine_side():
    m = HoldMachine(TABLE)
    k = press(BKSP, KC_BKSP, name='BackSpace')
    assert m.key(k).actions == [('repeat_start', k)]
    assert m.key(release(BKSP, KC_BKSP)).actions == [('repeat_stop',)]


def test_modifiers_do_not_repeat_or_disarm():
    m = HoldMachine(TABLE)
    assert m.key(press(SHIFT, KC_SHIFT, modifier=True)).actions == []
    m.key(press(E, KC_E, 'e'))
    assert m.key(press(SHIFT, KC_SHIFT, modifier=True)).actions == []
    assert m.state == ARMED


def test_candidate_click():
    m = opened()
    assert m.candidate_clicked(1)[-1] == ('replace', 'e', 'è')
    assert m.candidate_clicked(0) == []


def test_cancel_from_each_state():
    m = opened()
    assert ('hide',) in m.cancel() and m.state == IDLE
    m.key(press(E, KC_E, 'e'))
    assert ('disarm',) in m.cancel()


def test_hold_elapsed_after_tap_is_noop():
    m = HoldMachine(TABLE)
    m.key(press(E, KC_E, 'e'))
    m.key(release(E, KC_E, 'e'))
    assert m.hold_elapsed() == [] and m.state == IDLE


def test_parse_extension_default_table():
    with open(os.path.join(REPO, 'extension', 'defaultAccents.js'), encoding='utf-8') as f:
        table = parse_default_accents(f.read())
    assert table['e'][0] == 'é'
    assert 'ç' in table['c'] and 'Ç' in table['C']


def test_load_table_override_and_fallback():
    assert load_table('{"q": ["ǫ"]}', TABLE) == {'q': ['ǫ']}
    assert load_table('', TABLE) is TABLE
    assert load_table('not json', TABLE) is TABLE
    assert load_table('{"ab": ["x"], "e": []}', TABLE) is TABLE
