/**
 * Shared CodeMirror policy for the document editor and embedded table cells.
 * Callers inject concrete extensions; this module owns which behavior is
 * shared and which remains surface-specific.
 */

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

export function createTableCellProfile({
    viewRegistryExtension,
    keymapExtension,
    defaultBindings,
    vimExtension,
    indentationExtensions = [],
    clipboardExtensions = [],
    historyBindings,
    searchBindings,
}) {
    return {
        extensions: [
            viewRegistryExtension,
            ...indentationExtensions,
            ...clipboardExtensions,
            keymapExtension(defaultBindings),
            ...(vimExtension ? [vimExtension] : []),
        ],
        // Document-wide history and search must reach the root document even
        // while an embedded cell editor owns focus.
        globalKeyBindings: [...historyBindings, ...searchBindings],
    };
}
