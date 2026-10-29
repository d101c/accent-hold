// Press-and-hold state machine, free of Shell imports so it can be tested with
// plain gjs. Same model as ibus/holdcore.py: a tapped letter is forwarded to the
// application right away, holding an accentable letter for `hold-ms` opens the
// variants, and picking one replaces the letter that was already inserted.

// Hardware (evdev) keycodes of the digit row: KEY_1 = 2 ... KEY_9 = 10. The
// digit row is selected by position so it works on AZERTY too.
const DIGIT_ROW_FIRST = 2;
const DIGIT_ROW_LAST = 10;
export const MAX_LABELS = DIGIT_ROW_LAST - DIGIT_ROW_FIRST + 1;

export const IDLE = 'idle';
export const ARMED = 'armed';
export const OPEN = 'open';

const NAV_PREV = new Set(['Left', 'Up', 'ISO_Left_Tab']);
const NAV_NEXT = new Set(['Right', 'Down', 'Tab']);
const NAV_CONFIRM = new Set(['Return', 'KP_Enter', 'space']);
const NAV_CANCEL = new Set(['Escape']);
export const NAV_KEYS = new Set([...NAV_PREV, ...NAV_NEXT, ...NAV_CONFIRM, ...NAV_CANCEL]);

// A key event: {keyval, keycode, char, release, shortcut, modifier, name,
// keypadDigit}. `char` is '' for non-printing keys, `name` is set for
// NAV_KEYS only, `keypadDigit` is 0..8 for keypad 1..9, else -1.
export function makeKey(fields) {
    return {
        keyval: 0, keycode: 0, char: '', release: false, shortcut: false,
        modifier: false, name: '', keypadDigit: -1, ...fields,
    };
}

function digitIndex(key) {
    if (key.keycode >= DIGIT_ROW_FIRST && key.keycode <= DIGIT_ROW_LAST)
        return key.keycode - DIGIT_ROW_FIRST;
    return key.keypadDigit;
}

// key() returns {consumed, actions}. Actions are arrays:
//   ['arm'] / ['disarm']            start / cancel the hold timer
//   ['show', candidates, index]     show the variants
//   ['move', index]                 move the highlight
//   ['hide']                        hide the variants
//   ['replace', base, text]         replace the inserted `base` with `text`
export class HoldMachine {
    constructor(getTable) {
        this._getTable = getTable;
        this._toIdle();
    }

    key(key) {
        if (this.state === OPEN)
            return this._keyOpen(key);
        if (this.state === ARMED)
            return this._keyArmed(key);
        return this._keyIdle(key);
    }

    holdElapsed() {
        if (this.state !== ARMED)
            return [];
        this.state = OPEN;
        this.candidates = this._getTable()[this.base].slice(0, MAX_LABELS);
        this.index = 0;
        return [['show', this.candidates, this.index]];
    }

    candidateClicked(index) {
        if (this.state !== OPEN || index < 0 || index >= this.candidates.length)
            return [];
        return this._choose(index);
    }

    cancel() {
        const actions = [];
        if (this.state === OPEN)
            actions.push(['hide']);
        else if (this.state === ARMED)
            actions.push(['disarm']);
        this._toIdle();
        return actions;
    }

    _keyIdle(key) {
        const variants = this._getTable()[key.char];
        if (!key.release && !key.shortcut && variants?.length) {
            this.state = ARMED;
            this.base = key.char;
            this.held = key.keyval;
            return {consumed: false, actions: [['arm']]};
        }
        return {consumed: false, actions: []};
    }

    _keyArmed(key) {
        if (key.keyval === this.held) {
            if (key.release) {
                // Quick tap: the letter is already in the application.
                this._toIdle();
                return {consumed: false, actions: [['disarm']]};
            }
            return {consumed: true, actions: []};
        }
        if (key.release || key.modifier)
            return {consumed: false, actions: []};
        this._toIdle();
        const result = this._keyIdle(key);
        result.actions.unshift(['disarm']);
        return result;
    }

    _keyOpen(key) {
        if (key.keyval === this.held) {
            // The press reached the application, so must its release.
            return {consumed: !key.release, actions: []};
        }
        if (key.release)
            return {consumed: this._isSelectionKey(key), actions: []};
        if (key.modifier)
            return {consumed: false, actions: []};

        const index = digitIndex(key);
        if (index >= 0 && !key.shortcut) {
            if (index < this.candidates.length)
                return {consumed: true, actions: this._choose(index)};
            return {consumed: true, actions: []};
        }
        if (NAV_PREV.has(key.name) || NAV_NEXT.has(key.name)) {
            const n = this.candidates.length;
            const step = NAV_PREV.has(key.name) ? -1 : 1;
            this.index = (this.index + step + n) % n;
            return {consumed: true, actions: [['move', this.index]]};
        }
        if (NAV_CONFIRM.has(key.name))
            return {consumed: true, actions: this._choose(this.index)};
        if (NAV_CANCEL.has(key.name)) {
            this._toIdle();
            return {consumed: true, actions: [['hide']]};
        }

        // Anything else keeps the plain letter and is handled as a new key.
        this._toIdle();
        const result = this._keyIdle(key);
        result.actions.unshift(['hide']);
        return result;
    }

    _isSelectionKey(key) {
        return digitIndex(key) >= 0 || NAV_KEYS.has(key.name);
    }

    _choose(index) {
        const base = this.base, text = this.candidates[index];
        this._toIdle();
        return [['hide'], ['replace', base, text]];
    }

    _toIdle() {
        this.state = IDLE;
        this.base = null;
        this.held = null;
        this.candidates = [];
        this.index = 0;
    }
}
