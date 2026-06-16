#!/usr/bin/env gjs
const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

const path = ARGV[0] || 'accents.json';
const [ok, bytes] = GLib.file_get_contents(path);
if (!ok) { printerr('cannot read ' + path); imports.system.exit(1); }
let table;
try { table = JSON.parse(ByteArray.toString(bytes)); }
catch (e) { printerr('invalid JSON: ' + e); imports.system.exit(1); }

const required = ['a','e','i','o','u','c','n'];
let errors = 0;
for (const k of required) {
    if (!Array.isArray(table[k]) || table[k].length === 0) {
        printerr(`missing/empty key: ${k}`); errors++;
    }
}
for (const [k, arr] of Object.entries(table)) {
    if (!Array.isArray(arr)) { printerr(`value not array: ${k}`); errors++; continue; }
    for (const v of arr) {
        if (typeof v !== 'string' || [...v].length !== 1) {
            printerr(`variant not single codepoint: ${k} -> "${v}"`); errors++;
        }
    }
}
if (errors > 0) { printerr(`FAIL: ${errors} error(s)`); imports.system.exit(1); }
print('OK: ' + Object.keys(table).length + ' base letters');
