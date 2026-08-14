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
