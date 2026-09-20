/** External observers of CodeMirror. Selection/geometry remain CodeMirror-owned. */
export const EDITOR_UPDATE_CONSUMERS = Object.freeze({
    outline: Object.freeze({ changes: ['document', 'selection', 'viewport', 'owner'], schedule: 'immediate' }),
    writing: Object.freeze({ changes: ['document'], schedule: 'immediate', deferred: 'analysis after 100 ms quiet' }),
    activity: Object.freeze({ changes: ['document', 'owner'], schedule: 'immediate', deferred: 'activity controller' }),
    previews: Object.freeze({ changes: ['owner'], schedule: 'microtask' }),
});

export function editorUpdateReasons(update) {
    return [
        ['document', update.docChanged || update.writingChanges],
        ['selection', update.selectionSet],
        ['viewport', update.viewportChanged],
        ['geometry', update.geometryChanged],
        ['syntax', update.syntaxChanged],
        ['owner', update.ownerChanged],
    ].filter(([, changed]) => changed).map(([reason]) => reason);
}

export function editorConsumerReasons(name, reasons) {
    const contract = EDITOR_UPDATE_CONSUMERS[name];
    if (!contract) throw new Error(`Unknown editor update consumer: ${name}`);
    return reasons.filter(reason => contract.changes.includes(reason));
}
