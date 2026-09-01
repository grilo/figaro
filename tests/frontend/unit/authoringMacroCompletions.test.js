import { EditorState } from '@codemirror/state';
import { createAuthoringMacroCompletionSource } from '../../../frontend/js/authoringMacroCompletions.js';
import { basicMarkdownTable, emptyMermaidBlock } from '../../../frontend/js/core/authoringMacroModel.js';

function completionContext(source, pos = source.length) {
    return { state: EditorState.create({ doc: source }), pos, explicit: true };
}

function testView(source) {
    let state = EditorState.create({ doc: source });
    const view = {
        isDestroyed: false,
        get state() { return state; },
        dispatch: jest.fn(transaction => {
            state = state.update(transaction).state;
        }),
    };
    return view;
}

describe('Figaro authoring macro completions', () => {
    test('offers every structured macro with Space acceptance', () => {
        const complete = createAuthoringMacroCompletionSource();
        const result = complete(completionContext('@'));

        expect(result.options.map(option => option.label)).toEqual(['date', 'table', 'todo', 'mermaid', 'drawio']);
        expect(result.options.every(option => option.commitCharacters.includes(' '))).toBe(true);
        expect(result.filter).toBe(false);
        expect(createAuthoringMacroCompletionSource({ contextAllowed: () => false })(completionContext('@date')))
            .toBeNull();
        expect(complete(completionContext('@due'))).toBeNull();
    });

    test('@date hands its range to metadata scheduling without editing on cancellation', async () => {
        const openDuePicker = jest.fn();
        const complete = createAuthoringMacroCompletionSource({ openDuePicker });
        const view = testView('Plan @date');
        const result = complete(completionContext('Plan @date'));

        result.options[0].apply(view, null, result.from, 'Plan @date'.length);
        await Promise.resolve();
        expect(view.state.doc.toString()).toBe('Plan @date');
        const request = openDuePicker.mock.calls[0][0];
        expect(request.position).toBe('Plan @date'.length);
        expect(request.range).toEqual({ from: 5, to: 10 });
        expect(request.isCurrent()).toBe(true);
        view.dispatch({ changes: { from: 5, to: 10, insert: 'changed' } });
        expect(request.isCurrent()).toBe(false);
    });

    test('@todo inserts one unchecked item and leaves the cursor after its trailing space', () => {
        const complete = createAuthoringMacroCompletionSource();
        const view = testView('@todo');
        const result = complete(completionContext('@todo'));

        result.options[0].apply(view, null, 0, 5);
        expect(view.state.doc.toString()).toBe('- [ ] ');
        expect(view.state.selection.main.head).toBe(6);
        expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({ userEvent: 'input.complete' }));
    });

    test('@table and @mermaid open their existing editors for the inserted ranges', async () => {
        const openTableEditor = jest.fn();
        const openMermaidEditor = jest.fn();
        const complete = createAuthoringMacroCompletionSource({ openTableEditor, openMermaidEditor });

        const tableView = testView('@table');
        const tableResult = complete(completionContext('@table'));
        tableResult.options[0].apply(tableView, null, 0, 6);
        await Promise.resolve();
        expect(tableView.state.doc.toString()).toBe(basicMarkdownTable);
        expect(openTableEditor).toHaveBeenCalledWith({
            view: tableView,
            from: 0,
            to: basicMarkdownTable.length,
        });

        const mermaidView = testView('@mermaid');
        const mermaidResult = complete(completionContext('@mermaid'));
        mermaidResult.options[0].apply(mermaidView, null, 0, 8);
        await Promise.resolve();
        expect(mermaidView.state.doc.toString()).toBe(emptyMermaidBlock);
        expect(mermaidView.state.selection.main.head).toBe('```mermaid\n'.length);
        expect(openMermaidEditor).toHaveBeenCalledWith({
            view: mermaidView,
            from: 0,
            to: emptyMermaidBlock.length,
        });
    });

    test('@drawio waits for successful asset creation before inserting its image reference', async () => {
        const openDrawioCreator = jest.fn();
        const complete = createAuthoringMacroCompletionSource({ openDrawioCreator });
        const view = testView('@drawio');
        const result = complete(completionContext('@drawio'));

        result.options[0].apply(view, null, 0, 7);
        await Promise.resolve();
        expect(view.state.doc.toString()).toBe('@drawio');
        const request = openDrawioCreator.mock.calls[0][0];
        expect(request.insertReference('diagram1')).toBe(true);
        expect(view.state.doc.toString()).toBe('![Diagram](./diagram1.drawio.svg)');
    });
});
