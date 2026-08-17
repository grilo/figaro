/** Shared CodeMirror policy for the document editor. */

export function createDocumentKeyBindings({
    searchBindings,
    defaultBindings,
    historyBindings,
    completionBindings,
    acceptCompletion,
    indentMore,
    indentLess,
}) {
    return [
        ...searchBindings,
        ...defaultBindings,
        ...historyBindings,
        ...completionBindings,
        {
            key: 'Tab',
            run: view => acceptCompletion(view) || indentMore(view),
            shift: indentLess,
        },
    ];
}
