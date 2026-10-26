"""Press-and-hold state machine, independent of IBus so it can be unit-tested.

The engine feeds key events in and gets back whether the event is consumed
plus a list of actions to perform (show the candidates, replace the letter,
start engine-side key repeat, ...). The IBus layer only executes actions.

Model: a tapped letter is always forwarded to the application right away,
so ordinary typing is never delayed. Holding an accentable letter for
`hold_ms` opens the candidate list; picking a candidate replaces the letter
that was already inserted.
"""

import json
import re
from dataclasses import dataclass, field

# Hardware (evdev) keycodes of the digit row: KEY_1 = 2 ... KEY_9 = 10. The
# digit row is selected by position so it works on layouts where the digits
# need Shift (AZERTY) or produce other symbols.
DIGIT_ROW_FIRST = 2
DIGIT_ROW_LAST = 10
MAX_LABELS = DIGIT_ROW_LAST - DIGIT_ROW_FIRST + 1

IDLE, ARMED, OPEN = 'idle', 'armed', 'open'


@dataclass(frozen=True)
class Key:
    keyval: int
    keycode: int
    char: str = ''          # text the key produces ('' for non-printing keys)
    release: bool = False
    shortcut: bool = False  # Ctrl, Alt or Super held
    modifier: bool = False  # the key itself is Shift, Ctrl, Caps Lock, ...
    name: str = ''          # symbolic name for navigation keys, see NAV_KEYS
    keypad_digit: int = -1  # 0..8 for keypad 1..9, else -1


# Navigation keys understood while the candidate list is open.
NAV_PREV = {'Left', 'Up', 'ISO_Left_Tab'}
NAV_NEXT = {'Right', 'Down', 'Tab'}
NAV_CONFIRM = {'Return', 'KP_Enter', 'space'}
NAV_CANCEL = {'Escape'}
NAV_KEYS = NAV_PREV | NAV_NEXT | NAV_CONFIRM | NAV_CANCEL


@dataclass
class Result:
    consumed: bool
    actions: list = field(default_factory=list)


def digit_index(key):
    """Candidate index (0-based) selected by `key`, or -1."""
    if DIGIT_ROW_FIRST <= key.keycode <= DIGIT_ROW_LAST:
        return key.keycode - DIGIT_ROW_FIRST
    return key.keypad_digit


class HoldMachine:
    """Actions emitted (tuples):

    ('arm',)                         start the hold timer
    ('disarm',)                      cancel the hold timer
    ('show', candidates, index)      show the candidate list
    ('move', index)                  move the highlight
    ('hide',)                        hide the candidate list
    ('replace', base, text)          replace the inserted `base` with `text`
    ('repeat_start', key)            repeat `key` engine-side while held
    ('repeat_stop',)                 stop engine-side repeat
    """

    def __init__(self, table):
        self.table = table
        self.state = IDLE
        self.base = None
        self.held = None
        self.candidates = []
        self.index = 0

    # -- events --------------------------------------------------------------

    def key(self, key):
        if self.state == OPEN:
            return self._key_open(key)
        if self.state == ARMED:
            return self._key_armed(key)
        return self._key_idle(key)

    def hold_elapsed(self):
        if self.state != ARMED:
            return []
        self.state = OPEN
        self.candidates = list(self.table[self.base])[:MAX_LABELS]
        self.index = 0
        return [('show', self.candidates, self.index)]

    def candidate_clicked(self, index):
        if self.state != OPEN or not 0 <= index < len(self.candidates):
            return []
        return self._choose(index)

    def cancel(self):
        actions = []
        if self.state == OPEN:
            actions.append(('hide',))
        elif self.state == ARMED:
            actions.append(('disarm',))
        self._to_idle()
        return actions + [('repeat_stop',)]

    # -- states --------------------------------------------------------------

    def _key_idle(self, key):
        if key.release:
            return Result(False, [('repeat_stop',)])
        if not key.shortcut and key.char in self.table:
            self.state = ARMED
            self.base = key.char
            self.held = key.keyval
            return Result(False, [('repeat_stop',), ('arm',)])
        if key.modifier:
            return Result(False)
        return Result(False, [('repeat_start', key)])

    def _key_armed(self, key):
        if key.keyval == self.held:
            if key.release:
                # Quick tap: the letter is already in the application.
                self._to_idle()
                return Result(False, [('disarm',)])
            # A repeat of the held letter (should not happen with the
            # compositor repeat off): never let it type a second letter.
            return Result(True)
        if key.release or key.modifier:
            return Result(False)
        self._to_idle()
        result = self._key_idle(key)
        result.actions.insert(0, ('disarm',))
        return result

    def _key_open(self, key):
        if key.keyval == self.held:
            # The press reached the application, so must its release; any
            # further press is a repeat and is swallowed.
            return Result(not key.release)
        if key.release:
            return Result(self._is_selection_key(key))
        if key.modifier:
            return Result(False)

        index = digit_index(key)
        if index >= 0 and not key.shortcut:
            if index < len(self.candidates):
                return Result(True, self._choose(index))
            return Result(True)
        if key.name in NAV_PREV or key.name in NAV_NEXT:
            step = -1 if key.name in NAV_PREV else 1
            self.index = (self.index + step) % len(self.candidates)
            return Result(True, [('move', self.index)])
        if key.name in NAV_CONFIRM:
            return Result(True, self._choose(self.index))
        if key.name in NAV_CANCEL:
            self._to_idle()
            return Result(True, [('hide',)])

        # Anything else keeps the plain letter and is handled as a new key.
        self._to_idle()
        result = self._key_idle(key)
        result.actions.insert(0, ('hide',))
        return result

    # -- helpers -------------------------------------------------------------

    def _is_selection_key(self, key):
        return digit_index(key) >= 0 or key.name in NAV_KEYS

    def _choose(self, index):
        base, text = self.base, self.candidates[index]
        self._to_idle()
        return [('hide',), ('replace', base, text)]

    def _to_idle(self):
        self.state = IDLE
        self.base = None
        self.held = None
        self.candidates = []
        self.index = 0


# -- accent table ------------------------------------------------------------

def parse_default_accents(js_source):
    """Read DEFAULT_ACCENTS from the extension's defaultAccents.js.

    The extension keeps its table as a JS module (no file IO in shell code),
    so the engine reads that same file rather than keeping a second copy.
    """
    match = re.search(r'DEFAULT_ACCENTS\s*=\s*(\{.*\})\s*;', js_source, re.S)
    if not match:
        raise ValueError('DEFAULT_ACCENTS not found')
    body = re.sub(r'//[^\n]*', '', match.group(1))
    body = body.replace("'", '"')
    body = re.sub(r',(\s*[\]}])', r'\1', body)
    return validate_table(json.loads(body))


def validate_table(table):
    """Keep only single-character keys mapped to non-empty lists of strings."""
    if not isinstance(table, dict):
        raise ValueError('accent table must be an object')
    clean = {}
    for base, variants in table.items():
        if not isinstance(base, str) or len(base) != 1:
            continue
        if not isinstance(variants, list):
            continue
        variants = [v for v in variants if isinstance(v, str) and v]
        if variants:
            clean[base] = variants
    return clean


def load_table(override_json, default_table):
    """User table from the `accents` setting, or the default one."""
    if override_json and override_json.strip():
        try:
            table = validate_table(json.loads(override_json))
            if table:
                return table
        except ValueError:
            pass
    return default_table
