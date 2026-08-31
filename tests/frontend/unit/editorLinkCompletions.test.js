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
    test('offers recursively discovered images with encoded paths', () => {
        const { imageCompletions } = completionFixture();
        const result = imageCompletions(completionContext('![scr'));
        expect(result.options).toHaveLength(1);

        const dispatch = jest.fn();
        result.options[0].apply({ dispatch }, null, result.from, 5);
        expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
            changes: expect.objectContaining({
                insert: '![screen shot.png](assets/screen%20shot.png)',
            }),
        }));
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
