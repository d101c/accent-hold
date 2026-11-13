// Run: gjs -m extension/tests/presets.test.js
import System from 'system';
import {parseTable} from '../defaultAccents.js';
import {BUILTIN_PRESETS, builtinTable, serializePreset, parsePresetFile,
    parseUserPresets, sameTable} from '../presets.js';

let failures = 0;
function test(name, fn) {
    try {
        fn();
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

test('every built-in preset is a valid table with unique id', () => {
    const ids = new Set();
    for (const {id} of BUILTIN_PRESETS) {
        check(!ids.has(id), `duplicate id ${id}`);
        ids.add(id);
        const table = builtinTable(id);
        check(parseTable(JSON.stringify(table)) !== null, `${id} is not a valid table`);
        check(Object.keys(table).length > 0, `${id} is empty`);
    }
});

test('capitals are generated and sharp s / dotless i are kept', () => {
    const fr = builtinTable('french');
    check(fr.e.join('') === 'éèêë' && fr.E.join('') === 'ÉÈÊË', 'french e/E');
    check(fr.o.includes('œ') && fr.O.includes('Œ'), 'oe ligature');
    const de = builtinTable('german');
    check(de.s.join('') === 'ß', 'sharp s on s');
    check(de.S === undefined, 'no capital sharp s');
    const tr = builtinTable('turkish');
    check(tr.i.includes('ı') && tr.I.includes('İ'), 'turkish i');
});

test('a preset file round-trips', () => {
    const table = builtinTable('nordic');
    const back = parsePresetFile(serializePreset('Nordic', table));
    check(back !== null && back.name === 'Nordic', 'name');
    check(sameTable(back.table, table), 'table');
});

test('a bare table is accepted as a nameless preset', () => {
    const back = parsePresetFile('{"e": ["é", "è"]}');
    check(back !== null && back.name === '' && back.table.e.length === 2, 'bare table');
});

test('malformed preset files are rejected', () => {
    for (const text of ['', '{', '[]', 'null', '{"name": "x"}',
        '{"name": 3, "accents": {"e": ["é"]}}',
        '{"name": "x", "accents": []}',
        '{"name": "x", "accents": {"e": "é"}}',
        '{"name": "x", "accents": {"e": ["é", ""]}}'])
        check(parsePresetFile(text) === null, `accepted: ${text}`);
});

test('saved presets: bad entries are dropped one by one', () => {
    const out = parseUserPresets('{"Good": {"e": ["é"]}, "Bad": {"e": 1}, " ": {"e": ["é"]}}');
    check(Object.keys(out).join() === 'Good', `kept ${Object.keys(out)}`);
    check(Object.keys(parseUserPresets('nope')).length === 0, 'not JSON');
    check(Object.keys(parseUserPresets('[]')).length === 0, 'array');
});

test('sameTable ignores key order', () => {
    check(sameTable({a: ['à'], e: ['é']}, {e: ['é'], a: ['à']}), 'order');
    check(!sameTable({a: ['à']}, {a: ['á']}), 'content');
});

System.exit(failures ? 1 : 0);
