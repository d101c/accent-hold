// Ready-made accent tables, and the file format used to share presets.
//
// A preset is a plain table (base character -> list of variants), exactly what
// the `accents` setting holds. The ids are stable; the labels are translated
// by the preferences window, which is the only place that needs gettext.

import {DEFAULT_ACCENTS, formatTable, parseTable} from './defaultAccents.js';

// Build a table from lowercase variants, adding the capitals automatically.
// `lower` maps a lowercase base to its lowercase variants.
function withCapitals(lower) {
    const table = {};
    for (const [base, variants] of Object.entries(lower)) {
        table[base] = variants;
        // A set: two lowercase forms can share one capital (σ, ς -> Σ).
        table[base.toUpperCase()] = [...new Set(variants.map(v => v.toUpperCase()))];
    }
    return table;
}

export const BUILTIN_PRESETS = [
    {id: 'all', table: DEFAULT_ACCENTS},
    {id: 'french', table: withCapitals({
        a: ['à', 'â'], c: ['ç'], e: ['é', 'è', 'ê', 'ë'], i: ['î', 'ï'],
        o: ['ô', 'œ'], u: ['ù', 'û', 'ü'], y: ['ÿ'],
    })},
    {id: 'spanish', table: withCapitals({
        a: ['á'], e: ['é'], i: ['í'], o: ['ó'], u: ['ú', 'ü'], n: ['ñ'],
    })},
    {id: 'portuguese', table: withCapitals({
        a: ['á', 'à', 'â', 'ã'], c: ['ç'], e: ['é', 'ê'], i: ['í'],
        o: ['ó', 'ô', 'õ'], u: ['ú', 'ü'],
    })},
    {id: 'italian', table: withCapitals({
        a: ['à'], e: ['è', 'é'], i: ['ì', 'í'], o: ['ò', 'ó'], u: ['ù', 'ú'],
    })},
    {id: 'german', table: withCapitals({
        a: ['ä'], o: ['ö'], u: ['ü'],
    }), extra: {s: ['ß']}},
    {id: 'nordic', table: withCapitals({
        a: ['å', 'ä', 'æ'], o: ['ö', 'ø'], e: ['é'], d: ['ð'], t: ['þ'],
    })},
    {id: 'polish', table: withCapitals({
        a: ['ą'], c: ['ć'], e: ['ę'], l: ['ł'], n: ['ń'], o: ['ó'],
        s: ['ś'], z: ['ź', 'ż'],
    })},
    {id: 'czech', table: withCapitals({
        a: ['á'], c: ['č'], d: ['ď'], e: ['é', 'ě'], i: ['í'], n: ['ň'],
        o: ['ó'], r: ['ř'], s: ['š'], t: ['ť'], u: ['ú', 'ů'], y: ['ý'], z: ['ž'],
    })},
    {id: 'turkish', table: withCapitals({
        c: ['ç'], g: ['ğ'], o: ['ö'], s: ['ş'], u: ['ü'],
    }), extra: {i: ['ı', 'İ'], I: ['İ', 'ı']}},
    {id: 'romanian', table: withCapitals({
        a: ['ă', 'â'], i: ['î'], s: ['ș'], t: ['ț'],
    })},
    {id: 'typography', table: {
        '-': ['–', '—', '−', '‐'],
        '.': ['…', '·', '•'],
        '"': ['«', '»', '“', '”', '„'],
        "'": ['‘', '’', '‚', '′'],
        '<': ['≤', '‹', '←'],
        '>': ['≥', '›', '→'],
        '=': ['≠', '≈', '≡'],
        '+': ['±', '×', '÷'],
        '$': ['€', '£', '¥', '¢'],
        '%': ['‰', '°'],
        '?': ['¿', '‽'],
        '!': ['¡', '‼'],
    }},
    // Symbols on the keys that look like them. No letters here, so the table
    // can be added to a language without touching its accents.
    {id: 'math', table: {
        '=': ['≠', '≈', '≡', '≅', '∝'],
        '<': ['≤', '≪', '←', '⇐', '↔', '⇔'],
        '>': ['≥', '≫', '→', '⇒', '↦'],
        '+': ['±', '∑', '⊕'],
        '-': ['−', '∓', '¬'],
        '*': ['×', '·', '∘', '⊗'],
        '/': ['÷', '√', '∤'],
        '|': ['↑', '↓', '↕', '∥'],
        '(': ['∈', '∉', '⊂', '⊆', '∩'],
        ')': ['∋', '⊃', '⊇', '∪'],
        '0': ['∞', '∅', '°'],
        '~': ['∼', '≃'],
        '!': ['∀', '∃', '∄'],
        '.': ['∴', '∵', '…'],
    }},
    // Latin key -> the Greek letter usually typed with it.
    {id: 'greek', table: withCapitals({
        a: ['α'], b: ['β'], g: ['γ'], d: ['δ'], e: ['ε'], z: ['ζ'], h: ['η'],
        q: ['θ'], i: ['ι'], k: ['κ'], l: ['λ'], m: ['μ'], n: ['ν'], x: ['ξ'],
        o: ['ο'], p: ['π'], r: ['ρ'], s: ['σ', 'ς'], t: ['τ'], u: ['υ'],
        f: ['φ'], c: ['χ'], y: ['ψ'], w: ['ω'],
    })},
];

// Fold the `extra` entries of a built-in preset into its table. Done once, on
// access, so the list above stays readable.
export function builtinTable(id) {
    const preset = BUILTIN_PRESETS.find(p => p.id === id);
    if (!preset)
        return null;
    const table = {...preset.table};
    for (const [base, variants] of Object.entries(preset.extra ?? {}))
        table[base] = [...new Set([...(table[base] ?? []), ...variants])];
    return table;
}

// --- Shareable files -------------------------------------------------------
//
// {"name": "Norwegian", "accents": {"a": ["å", "æ"], ...}}
//
// A bare table ({"e": ["é"], ...}), the format of the `accents` setting, is
// accepted too, so an existing table can be imported as it is.

export function serializePreset(name, table) {
    // Same one-line-per-letter layout as the editor: easy to read and to edit.
    const accents = formatTable(table).replace(/\n/g, '\n  ');
    return `{\n  "name": ${JSON.stringify(name)},\n  "accents": ${accents}\n}\n`;
}

// Returns {name, table}, or null when the text is not a preset. `name` is ''
// for a bare table: the caller picks one (usually the file name).
export function parsePresetFile(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data))
        return null;

    if (data.accents !== undefined && typeof data.accents === 'object' &&
        data.accents !== null && !Array.isArray(data.accents) &&
        (data.name === undefined || typeof data.name === 'string')) {
        const table = parseTable(JSON.stringify(data.accents));
        if (table === null)
            return null;
        return {name: (data.name ?? '').trim(), table};
    }

    const table = parseTable(text);
    return table === null ? null : {name: '', table};
}

// Saved presets live in one JSON setting: {"Norwegian": {table}, ...}.
// Anything malformed is dropped entry by entry, never the whole list.
export function parseUserPresets(json) {
    let data;
    try {
        data = JSON.parse(json);
    } catch {
        return {};
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data))
        return {};
    const out = {};
    for (const [name, table] of Object.entries(data)) {
        if (name.trim() === '')
            continue;
        const ok = parseTable(JSON.stringify(table));
        if (ok !== null)
            out[name] = ok;
    }
    return out;
}

// `base` with `extra` added to it: the keys and variants of `base` keep their
// place, the variants it did not have yet come after them, the new keys last.
export function mergeTables(base, extra) {
    const out = {};
    for (const [key, variants] of Object.entries(base))
        out[key] = [...variants];
    for (const [key, variants] of Object.entries(extra))
        out[key] = [...new Set([...(out[key] ?? []), ...variants])];
    return out;
}

// Same table, whatever the key order or spacing of the text it came from.
export function sameTable(a, b) {
    const norm = t => JSON.stringify(Object.keys(t).sort().map(k => [k, t[k]]));
    return norm(a) === norm(b);
}
