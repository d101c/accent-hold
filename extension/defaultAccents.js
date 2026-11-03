// Default accent table: base key -> list of accented variants.
// Users can override this from the preferences (the `accents` GSettings key).

// Parse a user table (JSON text) and check its shape: an object whose values
// are arrays of non-empty strings. Returns the table, or null when the text
// is not JSON or not shaped like a table, so the caller can fall back to the
// built-in one instead of failing later on a key press.
export function parseTable(json) {
    let table;
    try {
        table = JSON.parse(json);
    } catch {
        return null;
    }
    if (typeof table !== 'object' || table === null || Array.isArray(table))
        return null;
    for (const [base, variants] of Object.entries(table)) {
        if (base === '' || !Array.isArray(variants))
            return null;
        if (!variants.every(v => typeof v === 'string' && v !== ''))
            return null;
    }
    return table;
}

export const DEFAULT_ACCENTS = {
    'a': ['à', 'á', 'â', 'ä', 'æ', 'ã', 'å', 'ā'],
    'A': ['À', 'Á', 'Â', 'Ä', 'Æ', 'Ã', 'Å', 'Ā'],
    'c': ['ç', 'ć', 'č'],
    'C': ['Ç', 'Ć', 'Č'],
    'e': ['é', 'è', 'ê', 'ë', 'ē', 'ė', 'ę'],
    'E': ['É', 'È', 'Ê', 'Ë', 'Ē', 'Ė', 'Ę'],
    'i': ['î', 'ï', 'í', 'ī', 'į', 'ì'],
    'I': ['Î', 'Ï', 'Í', 'Ī', 'Į', 'Ì'],
    'n': ['ñ', 'ń'],
    'N': ['Ñ', 'Ń'],
    'o': ['ô', 'ö', 'ò', 'ó', 'œ', 'ø', 'õ', 'ō'],
    'O': ['Ô', 'Ö', 'Ò', 'Ó', 'Œ', 'Ø', 'Õ', 'Ō'],
    'u': ['û', 'ü', 'ù', 'ú', 'ū'],
    'U': ['Û', 'Ü', 'Ù', 'Ú', 'Ū'],
    'y': ['ÿ', 'ý'],
    'Y': ['Ÿ', 'Ý'],
    's': ['ß', 'ś', 'š'],
    'S': ['Ś', 'Š'],
    'z': ['ž', 'ź', 'ż'],
    'Z': ['Ž', 'Ź', 'Ż'],
};
