// Run: gjs -m extension/tests/holdMachine.test.js
import System from 'system';
import {HoldMachine, makeKey, surroundingRun, deletableCount} from '../holdMachine.js';
import {DEFAULT_ACCENTS} from '../defaultAccents.js';

let failures = 0;
function test(name, fn, table = DEFAULT_ACCENTS) {
    try {
        fn(new HoldMachine(() => table));
        print(`PASS ${name}`);
    } catch (e) {
        failures++;
        print(`FAIL ${name}: ${e.message}`);
    }
}
function check(cond, msg) {
    if (!cond)
        throw new Error(msg);
}
function same(a, b, msg) {
    check(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}`);
}
function kinds(actions) {
    return actions.map(a => a[0]);
}

const e = makeKey({keyval: 0x65, keycode: 18, state: 0, char: 'e'});
const eUp = {...e, release: true};
const digit = n => makeKey({keyval: 0x30 + n, keycode: n + 1, char: String(n)});
const x = makeKey({keyval: 0x78, keycode: 45, char: 'x'});

function open(m) {
    m.key(e);
    return m.holdElapsed();
}

// -- tap and hold ----------------------------------------------------------

test('tap types the letter and disarms', m => {
    check(!m.key(e).consumed, 'press passes');
    const r = m.key(eUp);
    check(!r.consumed && r.actions[0][0] === 'disarm', 'release disarms');
});

test('arm carries the key so the release can be forwarded later', m => {
    const r = m.key(e);
    same(r.actions, [['arm', e]], 'arm with key');
});

test('hold releases the key for the application, then shows', m => {
    m.key(e);
    const actions = m.holdElapsed();
    same(kinds(actions), ['release', 'show'], 'release before show');
    check(actions[0][1].keyval === 0x65 && actions[0][1].keycode === 18, 'release of the held key');
    same(actions[1][1], DEFAULT_ACCENTS.e, 'candidates');
});

test('hold then digit replaces', m => {
    check(m.key(e).actions[0][0] === 'arm', 'arms');
    check(m.holdElapsed()[1][0] === 'show', 'shows');
    check(!m.key(eUp).consumed, 'release of the held letter reaches the app');
    const r = m.key(digit(2));
    check(r.consumed, 'digit swallowed');
    same(r.actions, [['hide'], ['replace', 'e', 'è']], 'replace è');
});

test('holdElapsed when not armed does nothing', m => {
    same(m.holdElapsed(), [], 'idle');
    open(m);
    same(m.holdElapsed(), [], 'already open');
});

test('holdElapsed with a table entry that vanished goes idle', m => {
    const table = {e: ['é']};
    const mm = new HoldMachine(() => table);
    mm.key(e);
    delete table.e;
    same(mm.holdElapsed(), [], 'no show');
    check(mm.state === 'idle', 'idle');
});

test('non-array table entries never arm', m => {
    same(m.key(e).actions, [], 'object entry ignored');
}, {e: {length: 1}});

test('arrows and Return choose', m => {
    open(m);
    check(m.key(makeKey({name: 'Right'})).actions[0][1] === 1, 'moves right');
    const r = m.key(makeKey({name: 'Return'}));
    check(r.consumed && r.actions[1][2] === 'è', 'Return picks highlighted');
});

test('other key while open keeps the letter', m => {
    open(m);
    const r = m.key(x);
    check(!r.consumed && r.actions[0][0] === 'hide', 'x passes and hides');
});

test('non-accentable keys and shortcuts never arm', m => {
    check(m.key(x).actions.length === 0, 'x');
    check(m.key({...e, shortcut: true}).actions.length === 0, 'Ctrl+e');
});

// -- surrounding text (GNOME 45: [text, cursor]; 46+: [text, cursor, anchor])

test('surroundingRun counts the letters before the cursor', () => {
    check(surroundingRun(['thee', 4, 4], 'e') === 2, '46+ tuple');
    check(surroundingRun(['thee', 4], 'e') === 2, '45 tuple');
    check(surroundingRun(['thee', 2, 2], 'e') === 0, 'cursor in the middle');
    check(surroundingRun(['eee', 3, 3], 'e') === 3, 'whole text');
    check(surroundingRun(['', 0, 0], 'e') === 0, 'empty text');
});

test('surroundingRun rejects unusable surrounding text', () => {
    check(surroundingRun([null, null, null], 'e') === -1, 'no text');
    check(surroundingRun([null, null], 'e') === -1, 'no text (45)');
    check(surroundingRun(['thee', 2, 4], 'e') === -1, 'selection');
    check(surroundingRun(['the', 9, 9], 'e') === -1, 'cursor out of range');
    check(surroundingRun(undefined, 'e') === -1, 'not an array');
});

test('deletableCount deletes only what was inserted since the press', () => {
    check(deletableCount(0, 1) === 1, 'one letter');
    check(deletableCount(0, 5) === 5, 'client repeated four times');
    check(deletableCount(2, 3) === 1, 'after "thee"');
    check(deletableCount(2, 2) === 0, 'stale text: BackSpace path');
    check(deletableCount(-1, 3) === 1, 'no snapshot: only the last letter');
    check(deletableCount(0, 0) === 0, 'no letter before the cursor');
    check(deletableCount(0, -1) === 0, 'unusable now');
});

if (failures)
    System.exit(1);
