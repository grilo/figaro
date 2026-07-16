/**
 * Markdown date-shortcut completions.
 *
 * Selecting a shortcut inserts the same date link that the former inline
 * expansion created. Keeping the calculation here makes the completion apply
 * atomically, rather than waiting for a second editor update.
 */

export const dateShortcuts = [
    { label: 'today', offset: 0 },
    { label: 'tomorrow', offset: 1 },
    { label: 'yesterday', offset: -1 },
];

export function dateForShortcut(offset, now = new Date()) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function dateShortcutLink(offset, now = new Date()) {
    const date = dateForShortcut(offset, now);
    return `[${date}](${date}.md)`;
}

/**
 * Create the completion source for @today, @tomorrow, and @yesterday.
 * Suggestions only start at the beginning of a line or after whitespace, so
 * email addresses and other inline @-uses are left alone.
 */
export function createDateShortcutCompletionSource({ now = () => new Date() } = {}) {
    return context => {
        const line = context.state.doc.lineAt(context.pos);
        const before = context.state.doc.sliceString(line.from, context.pos);
        const match = before.match(/(?:^|\s)(@[a-z]*)$/i);
        if (!match) return null;

        const typedShortcut = match[1];
        const prefix = typedShortcut.slice(1).toLowerCase();
        const shortcuts = dateShortcuts.filter(shortcut => shortcut.label.startsWith(prefix));
        if (!shortcuts.length) return null;

        return {
            from: context.pos - typedShortcut.length,
            options: shortcuts.map(shortcut => ({
                label: shortcut.label,
                detail: dateForShortcut(shortcut.offset, now()),
                type: 'keyword',
                // Retains the existing "type the shortcut, then Space" flow.
                commitCharacters: [' '],
                apply: (view, _completion, from, to) => {
                    const replacement = dateShortcutLink(shortcut.offset, now());
                    view.dispatch({
                        changes: { from, to, insert: replacement },
                        selection: { anchor: from + replacement.length },
                    });
                },
            })),
            // The query includes '@', while visible labels intentionally do
            // not. Filter explicitly to keep the menu order deterministic.
            filter: false,
        };
    };
}
