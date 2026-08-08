/**
 * Decide how a delayed Windows dead-key resolution should be reconciled with
 * the editor state. The browser owns the first insertion; Figaro inserts a
 * fallback only when the document is still exactly as it was at keydown.
 */
export function planWindowsDeadKeyTextReconciliation({
    sourceText = '',
    currentText = '',
    from = 0,
    to = from,
    text = '',
} = {}) {
    const source = String(sourceText);
    const current = String(currentText);
    const insert = String(text);
    const start = Math.max(0, Math.min(source.length, Math.floor(Number(from) || 0)));
    const end = Math.max(start, Math.min(source.length, Math.floor(Number(to) || start)));

    if (!insert) return { action: 'preserve', changes: null, anchor: null };

    const prefix = source.slice(0, start);
    const suffix = source.slice(end);
    const once = `${prefix}${insert}${suffix}`;
    const twice = `${prefix}${insert}${insert}${suffix}`;

    if (current === source) {
        return {
            action: 'insert-fallback',
            changes: { from: start, to: end, insert },
            anchor: start + insert.length,
        };
    }
    if (current === once) {
        return { action: 'accept-native', changes: null, anchor: start + insert.length };
    }
    if (current === twice) {
        return {
            action: 'remove-duplicate',
            changes: { from: start + insert.length, to: start + (insert.length * 2), insert: '' },
            anchor: start + insert.length,
        };
    }
    return { action: 'preserve', changes: null, anchor: null };
}
