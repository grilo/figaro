import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { startCompletion } from '@codemirror/autocomplete';
import { createEditorLinkCompletions } from '../frontend/js/editorLinkCompletions.js';

jest.mock('@codemirror/autocomplete', () => ({ ...jest.requireActual('@codemirror/autocomplete'), startCompletion: jest.fn() }));

function completionContext(source) {
    const state = EditorState.create({ doc: source });
    return { state, pos: source.length };
}

function completionFixture(overrides = {}) {
    return createEditorLinkCompletions({
        getFileTree: () => [{
            type: 'directory',
            children: [
                { type: 'file', name: 'Guide.md', path: 'notes/Guide.md', mtime: 1 },
                { type: 'file', name: 'screen shot.png', path: 'assets/screen shot.png', mtime: 2 },
                { type: 'file', name: 'screenshot-old.jpg', path: 'archive/screenshot-old.jpg', mtime: 1 },
                { type: 'file', name: 'screen.jpeg', path: 'assets/screen.jpeg', mtime: 8 },
                { type: 'file', name: 'screen.gif', path: 'assets/screen.gif', mtime: 7 },
                { type: 'file', name: 'screen.svg', path: 'assets/screen.svg', mtime: 6 },
                { type: 'file', name: 'screen.webp', path: 'assets/screen.webp', mtime: 5 },
                { type: 'file', name: 'screen.bmp', path: 'assets/screen.bmp', mtime: 4 },
                { type: 'file', name: 'screen.ico', path: 'assets/screen.ico', mtime: 3 },
                { type: 'file', name: 'screen.pdf', path: 'assets/screen.pdf', mtime: 9 },
            ],
        }],
        searchNotes: jest.fn().mockResolvedValue({
            results: [{ name: 'Guide.md', path: 'notes/Guide.md' }],
        }),
        getActiveTab: () => ({ type: 'file', path: 'notes/current.md' }),
        getLinkStyle: () => 'markdown',
        createLinkedNote: jest.fn(),
        ...overrides,
    });
}

describe('editor link-completion assembly', () => {
    test('automatic triggers follow append, deletion, cursor moves and stale queued work', async () => {
        const completion = completionFixture();
        const view = new EditorView({ state: EditorState.create({ doc: '[Jump](', selection: { anchor: 7 },
            extensions: [completion.headingLinkCompletionActivator, completion.hashtagCompletionActivator] }), parent: document.body });
        const type = text => view.dispatch({ changes: { from: view.state.selection.main.head, insert: text },
            selection: { anchor: view.state.selection.main.head + text.length }, userEvent: 'input.type' });
        startCompletion.mockClear();
        try {
            type('#'); await Promise.resolve();
            expect(startCompletion).toHaveBeenCalledTimes(1);
            type('point'); await Promise.resolve();
            expect(startCompletion).toHaveBeenCalledTimes(2);
            type(') then #'); await Promise.resolve();
            expect(startCompletion).toHaveBeenCalledTimes(3);
            type('todo'); await Promise.resolve();
            expect(startCompletion).toHaveBeenCalledTimes(4);
            view.dispatch({ changes: { from: view.state.doc.length - 5, to: view.state.doc.length },
                selection: { anchor: view.state.doc.length - 5 }, userEvent: 'delete.backward' });
            type('ordinary'); await Promise.resolve();
            expect(startCompletion).toHaveBeenCalledTimes(4);
            view.dispatch({ selection: { anchor: 0 } });
            type('#'); await Promise.resolve();
            expect(startCompletion).toHaveBeenCalledTimes(4); // Line-leading heading.
            view.dispatch({ selection: { anchor: view.state.doc.length } });
            type(' #');
            type(' '); // Cancel before the queued completion can run.
            await Promise.resolve();
            expect(startCompletion).toHaveBeenCalledTimes(4);
        } finally { view.destroy(); }
    });
    test('offers recursively discovered images by recency, excludes other files, and applies encoded Markdown', () => {
        const { imageCompletions } = completionFixture();
        const result = imageCompletions(completionContext('![scr'));
        expect(result.options.map(option => option.label)).toEqual([
            'screen.jpeg',
            'screen.gif',
            'screen.svg',
            'screen.webp',
            'screen.bmp',
            'screen.ico',
            'screen shot.png',
            'screenshot-old.jpg',
        ]);

        const dispatch = jest.fn();
        result.options[6].apply({ dispatch }, null, result.from, 5);
        const insert = '![screen shot.png](assets/screen%20shot.png)';
        expect(dispatch).toHaveBeenCalledWith({
            changes: { from: result.from, to: 5, insert },
            selection: { anchor: result.from + insert.length },
        });
    });

    test('uses the search port for typed note links and keeps note creation available', async () => {
        const searchNotes = jest.fn().mockResolvedValue({
            results: [{ name: 'Guide.md', path: 'notes/Guide.md' }],
        });
        const { fileLinkCompletions } = completionFixture({ searchNotes });
        const result = await fileLinkCompletions(completionContext('[Gui'));

        expect(searchNotes).toHaveBeenCalledWith('Gui', expect.objectContaining({ profile: 'links' }));
        expect(result.options.map(option => option.label)).toEqual([
            'Guide',
            'Create “Gui”',
        ]);
    });

    test('offers matching in-document heading fragments', () => {
        const { headingLinkCompletions } = completionFixture();
        const source = '# Start here\n\nSee [start](#sta';
        const result = headingLinkCompletions(completionContext(source));

        expect(result.options).toEqual([
            expect.objectContaining({ label: 'Start here', detail: '#start-here' }),
        ]);
    });
});
