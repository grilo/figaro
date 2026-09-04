import { EditorState } from '@codemirror/state';
import { createEditorLinkCompletions } from '../frontend/js/editorLinkCompletions.js';

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
