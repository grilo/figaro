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
