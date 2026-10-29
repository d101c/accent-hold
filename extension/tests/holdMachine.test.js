// Run: gjs -m extension/tests/holdMachine.test.js
import {HoldMachine, makeKey} from '../holdMachine.js';
import {DEFAULT_ACCENTS} from '../defaultAccents.js';

let failures = 0;
function test(name, fn) {
    try {
        fn(new HoldMachine(() => DEFAULT_ACCENTS));
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

const e = makeKey({keyval: 0x65, keycode: 18, char: 'e'});
const eUp = {...e, release: true};
const digit = n => makeKey({keyval: 0x30 + n, keycode: n + 1, char: String(n)});

test('tap types the letter and disarms', m => {
    check(!m.key(e).consumed, 'press passes');
    const r = m.key(eUp);
    check(!r.consumed && r.actions[0][0] === 'disarm', 'release disarms');
});

test('hold then digit replaces', m => {
    check(m.key(e).actions[0][0] === 'arm', 'arms');
    check(m.holdElapsed()[0][0] === 'show', 'shows');
    check(!m.key(eUp).consumed, 'release of the held letter reaches the app');
    const r = m.key(digit(2));
    check(r.consumed, 'digit swallowed');
    check(JSON.stringify(r.actions) === JSON.stringify([['hide'], ['replace', 'e', 'è']]), 'replace è');
    check(m.key({...digit(2), release: true}).consumed === false, 'idle again');
});

test('arrows and Return choose', m => {
    m.key(e);
    m.holdElapsed();
    check(m.key(makeKey({name: 'Right'})).actions[0][1] === 1, 'moves right');
    const r = m.key(makeKey({name: 'Return'}));
    check(r.consumed && r.actions[1][2] === 'è', 'Return picks highlighted');
});

test('other key while open keeps the letter', m => {
    m.key(e);
    m.holdElapsed();
    const r = m.key(makeKey({keyval: 0x78, keycode: 45, char: 'x'}));
    check(!r.consumed && r.actions[0][0] === 'hide', 'x passes and hides');
});

test('non-accentable keys and shortcuts never arm', m => {
    check(m.key(makeKey({keyval: 0x78, keycode: 45, char: 'x'})).actions.length === 0, 'x');
    check(m.key({...e, shortcut: true}).actions.length === 0, 'Ctrl+e');
});

if (failures)
    imports.system.exit(1);
