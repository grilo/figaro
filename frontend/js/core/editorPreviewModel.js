/**
 * Pure rules for showing another revision of a note in the shared editor.
 * The editor adapter owns CodeMirror, history serialization and scheduling;
 * these decisions stay testable without it.
 */

/**
 * Decide how the editor leaves a revision preview.
 *
 * - `replaceWith` is the text to mount, or null when the previewed text is no
 *   longer on screen for its tab (another document replaced it).
 * - `restoreSelection` is true only when the displaced text itself returns.
 * - `history` is 'restore' for that same case, 'fresh' when the owning tab
 *   ends up with different text, and 'keep' when another tab owns the editor
 *   and has already installed its own undo history.
 */
export function editorPreviewClosePlan({
    ownsEditor = false,
    showsPreview = false,
    liveContent = '',
    restoredContent = null,
} = {}) {
    const visible = Boolean(ownsEditor && showsPreview);
    const content = typeof restoredContent === 'string' ? restoredContent : liveContent;
    const liveTextReturns = visible && content === liveContent;
    return {
        replaceWith: visible ? content : null,
        restoreSelection: liveTextReturns,
        history: !ownsEditor ? 'keep' : liveTextReturns ? 'restore' : 'fresh',
    };
}
