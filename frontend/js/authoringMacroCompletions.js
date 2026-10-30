import {
    authoringMacroCompletionPlan,
    authoringMacroInsertionPlan,
} from './core/authoringMacroModel.js';

function applyInsertion(view, name, from, to, options = {}) {
    if (!view || view.isDestroyed) return null;
    const plan = authoringMacroInsertionPlan(
        name,
        view.state.doc.toString(),
        { from, to },
        options,
    );
    if (!plan) return null;

    view.dispatch({
        changes: { from: plan.from, to: plan.to, insert: plan.insert },
        selection: { anchor: plan.from + plan.cursorOffset },
        scrollIntoView: true,
        userEvent: 'input.complete',
    });
    return {
        from: plan.from + plan.targetOffset,
        to: plan.from + plan.targetOffset + plan.targetLength,
    };
}

function openAfterCompletion(view, callback, target) {
    if (!target || typeof callback !== 'function') return;
    queueMicrotask(() => {
        if (!view.isDestroyed) callback({ view, ...target });
    });
}

/** Create completion options for Figaro's structured authoring macros. */
export function createAuthoringMacroCompletionSource({
    openDuePicker = null,
    openTableEditor = null,
    openMermaidEditor = null,
    openDiagramCreator = null,
    contextAllowed = () => true,
} = {}) {
    return context => {
        if (!contextAllowed(context)) return null;
        const line = context.state.doc.lineAt(context.pos);
        const before = context.state.doc.sliceString(line.from, context.pos);
        const plan = authoringMacroCompletionPlan(before);
        if (!plan) return null;

        return {
            from: line.from + plan.fromOffset,
            filter: false,
            options: plan.macros.map(macro => ({
                label: macro.name,
                detail: macro.detail,
                type: 'keyword',
                commitCharacters: [' '],
                apply: (view, _completion, from, to) => {
                    if (macro.action === 'date-picker') {
                        if (typeof openDuePicker !== 'function') return;
                        const expectedToken = view.state.sliceDoc(from, to);
                        const expectedDocument = view.state.doc.toString();
                        queueMicrotask(() => {
                            if (view.isDestroyed) return;
                            openDuePicker({
                                view,
                                position: to,
                                range: { from, to },
                                isCurrent: () => !view.isDestroyed && view.state.sliceDoc(from, to) === expectedToken
                                    && [expectedDocument, expectedDocument.slice(0, to) + ' ' + expectedDocument.slice(to)]
                                        .includes(view.state.doc.toString()),
                            });
                        });
                        return;
                    }

                    if (macro.action === 'diagram-create') {
                        if (typeof openDiagramCreator !== 'function') return;
                        const expectedToken = view.state.sliceDoc(from, to);
                        queueMicrotask(() => {
                            if (view.isDestroyed) return;
                            openDiagramCreator({
                                view,
                                kind: macro.kind,
                                position: to,
                                insertReference: diagramName => {
                                    if (view.isDestroyed || view.state.sliceDoc(from, to) !== expectedToken) return false;
                                    return Boolean(applyInsertion(view, macro.name, from, to, { diagramName }));
                                },
                            });
                        });
                        return;
                    }

                    const target = applyInsertion(view, macro.name, from, to);
                    if (macro.action === 'table-editor') openAfterCompletion(view, openTableEditor, target);
                    if (macro.action === 'mermaid-editor') openAfterCompletion(view, openMermaidEditor, target);
                },
            })),
        };
    };
}
