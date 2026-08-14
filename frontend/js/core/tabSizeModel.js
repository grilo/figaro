export const defaultTabSize = 4;
export const minimumTabSize = 2;
export const maximumTabSize = 8;

function normalizedFallback(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return defaultTabSize;
    return Math.min(maximumTabSize, Math.max(minimumTabSize, Math.round(numeric)));
}

/** Return one whole, bounded indentation width without depending on UI state. */
export function normalizeTabSize(value, fallback = defaultTabSize) {
    if (value === '' || value === null || value === undefined) return normalizedFallback(fallback);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return normalizedFallback(fallback);
    return Math.min(maximumTabSize, Math.max(minimumTabSize, Math.round(numeric)));
}

export function steppedTabSize(value, direction) {
    const current = normalizeTabSize(value);
    const delta = Math.sign(Number(direction) || 0);
    return normalizeTabSize(current + delta, current);
}

export function tabSizeIndentUnit(value) {
    return ' '.repeat(normalizeTabSize(value));
}

/** Expand literal tabs at the same column stops CodeMirror uses for display. */
export function expandedTabText(value, tabSize = defaultTabSize, initialColumn = 0) {
    const width = normalizeTabSize(tabSize);
    let columns = Math.max(0, Math.floor(Number(initialColumn) || 0));
    let text = '';
    for (const character of String(value ?? '')) {
        if (character === '\t') {
            const spaces = width - (columns % width);
            text += ' '.repeat(spaces);
            columns += spaces;
        } else {
            text += character;
            columns += 1;
        }
    }
    return { text, columns };
}
