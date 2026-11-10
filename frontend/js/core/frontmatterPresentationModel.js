export const FRONTMATTER_UPWARD_REVEAL_USER_EVENT = 'select.frontmatter-up';

/**
 * Resolve only the selection-driven Properties transition. Explicit panel and
 * source actions remain owned by the frontmatter adapter.
 */
export function frontmatterModeAfterSelection({
    mode = 'none',
    selectionChanged = false,
    selectionTouches = false,
    upwardRevealRequested = false,
} = {}) {
    if (mode === 'source' && selectionChanged && !selectionTouches) return 'collapsed';
    if (mode !== 'source' && selectionTouches && upwardRevealRequested) return 'source';
    return mode;
}

/** Only delimiter/header edits can change a leading Properties projection. */
export function frontmatterEditNeedsParse({ closedTo = null, leading = false, firstLine = '', openingEnd = 0, changes = [] }) {
    if (closedTo !== null) return changes.some(change => change.from <= closedTo);
    const nextLeading = /^\uFEFF?---[ \t]*\r?$/u.test(firstLine);
    if (!nextLeading) return leading;
    if (!leading || changes.some(change => change.from <= openingEnd)) return true;
    return changes.some(change => /^(?:---|\.\.\.)[ \t]*\r?$/mu.test(change.afterLines));
}

/**
 * Where the rendered Properties block ends. It normally ends where the body
 * starts. In a note that ends with the closing boundary's own line break, the
 * empty last line is the body: it stays outside the block, or the note would
 * have no line to type on.
 */
export function propertiesBlockEnd({ to, documentLength, lastLineEmpty }) {
    return to > 0 && to === documentLength && lastLineEmpty ? to - 1 : to;
}

/**
 * Text entered at the very end of a note whose last line is the closing
 * boundary starts the body on a new line. Appended to that line it would turn
 * "---" into "---text" and unclose the Properties. Returns the text to insert
 * instead, or null when the edit needs no help.
 */
export function propertiesBodyStartText({
    rendered = false,
    closedTo = null,
    documentLength = 0,
    lastLineEmpty = false,
    from = -1,
    to = -1,
    insert = '',
} = {}) {
    if (!rendered || closedTo === null || closedTo !== documentLength || lastLineEmpty) return null;
    if (from !== documentLength || to !== documentLength) return null;
    const text = String(insert ?? '');
    if (!text || text.startsWith('\n')) return null;
    return `\n${text}`;
}
