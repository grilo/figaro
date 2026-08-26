/**
 * Resolve application-level shortcuts before an editor or nested control can
 * consume the same physical key event. Character keys are normalized because
 * browsers expose shifted letters as uppercase values.
 */
export function globalShortcutAction(event = {}) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;

    const key = String(event.key || '').toLowerCase();
    const shifted = Boolean(event.shiftKey);

    if (key === 'f') return shifted ? 'global-search' : 'document-find';
    if (key === 'n' && !event.repeat) return shifted ? 'daily-note' : 'quick-note';
    if (key === 'b' && shifted) return 'toggle-sidebar';
    return null;
}

/** Keep the sidebar shortcut distinct from conventional Markdown Bold. */
export function isSidebarToggleShortcut(event = {}) {
    return globalShortcutAction(event) === 'toggle-sidebar';
}
