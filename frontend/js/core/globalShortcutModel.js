/**
 * Resolve application-level shortcuts before an editor or nested control can
 * consume the same physical key event. Character keys are normalized because
 * browsers expose shifted letters as uppercase values.
 */
/**
 * The Latin letter a shortcut event stands for. `key` holds the typed
 * character: uppercase under Caps Lock, and a letter of another script on
 * layouts such as Cyrillic or Greek, where only the physical key (`code`)
 * identifies the shortcut. A Latin `key` always wins, so Dvorak and similar
 * layouts keep their own letters.
 */
export function shortcutLetter(event = {}) {
    const key = String(event.key || '');
    if (/^[a-z]$/i.test(key)) return key.toLowerCase();
    const physical = /^Key([A-Z])$/.exec(String(event.code || ''));
    if (physical && /^\p{L}$/u.test(key)) return physical[1].toLowerCase();
    return key.toLowerCase();
}

function commandLetter(event) {
    // AltGr reports Ctrl+Alt on Windows; those combinations type characters.
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return '';
    return shortcutLetter(event);
}

/** Ctrl/Cmd+S, including under Caps Lock and on non-Latin layouts. */
export function isSaveShortcut(event = {}) {
    return commandLetter(event) === 's';
}

/** Ctrl/Cmd+W, including under Caps Lock and on non-Latin layouts. */
export function isCloseTabShortcut(event = {}) {
    return commandLetter(event) === 'w';
}

export function globalShortcutAction(event = {}) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;

    const key = shortcutLetter(event);
    const shifted = Boolean(event.shiftKey);

    if (key === 'f') return shifted ? 'global-search' : 'document-find';
    if (key === 'n' && !event.repeat) return shifted ? 'daily-note' : 'quick-note';
    if (key === 'b' && shifted) return 'toggle-sidebar';
    if (key === 'l' && shifted && !event.repeat) return 'writing-lenses';
    return null;
}

/** Keep the sidebar shortcut distinct from conventional Markdown Bold. */
export function isSidebarToggleShortcut(event = {}) {
    return globalShortcutAction(event) === 'toggle-sidebar';
}
