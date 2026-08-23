/**
 * Plan the one-step exit from an otherwise empty Markdown blockquote line.
 *
 * The editor keeps this rule pure so nested quote-level policy can be tested
 * without CodeMirror. One marker is removed per Enter press; at the outermost
 * level that leaves the existing source line empty, matching empty-list exit.
 */
export function emptyBlockquoteExitPlan({
    lineText,
    lineFrom = 0,
    selectionFrom,
    selectionTo = selectionFrom,
} = {}) {
    const text = String(lineText ?? '');
    if (!Number.isInteger(lineFrom) || lineFrom < 0) return null;
    if (!Number.isInteger(selectionFrom) || !Number.isInteger(selectionTo)) return null;
    if (selectionFrom !== selectionTo || selectionFrom !== lineFrom + text.length) return null;

    const match = text.match(/^( {0,3}(?:>\s*)*)(>\s*)$/);
    if (!match) return null;

    const remainingPrefix = match[1];
    return {
        changes: {
            from: lineFrom,
            to: lineFrom + text.length,
            insert: remainingPrefix,
        },
        selection: { anchor: lineFrom + remainingPrefix.length },
    };
}
