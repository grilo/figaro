import {
    createDocumentKeyBindings,
    createTableCellProfile,
} from '../frontend/js/codeMirrorProfiles.js';

describe('shared CodeMirror profiles', () => {
    test('keeps document editing, history, completion, and search in one policy', () => {
        const accept = jest.fn(() => false);
        const indent = jest.fn(() => true);
        const outdent = jest.fn(() => true);
        const bindings = createDocumentKeyBindings({
            searchBindings: ['search'],
            defaultBindings: ['default'],
            historyBindings: ['history'],
            completionBindings: ['completion'],
            acceptCompletion: accept,
            indentMore: indent,
            indentLess: outdent,
        });

        expect(bindings.slice(0, 4)).toEqual(['search', 'default', 'history', 'completion']);
        expect(bindings[4].key).toBe('Tab');
        expect(bindings[4].run('view')).toBe(true);
        expect(accept).toHaveBeenCalledWith('view');
        expect(indent).toHaveBeenCalledWith('view');
        expect(bindings[4].shift).toBe(outdent);
    });

    test('gives table cells local editing plus root history and search', () => {
        const keymapExtension = jest.fn(bindings => ({ bindings }));
        const profile = createTableCellProfile({
            viewRegistryExtension: 'registry',
            keymapExtension,
            defaultBindings: ['default'],
            vimExtension: ['vim'],
            indentationExtensions: ['tab-size', 'indent-unit'],
            historyBindings: ['undo', 'redo'],
            searchBindings: ['find'],
        });

        expect(profile.extensions).toEqual([
            'registry',
            'tab-size',
            'indent-unit',
            { bindings: ['default'] },
            ['vim'],
        ]);
        expect(profile.globalKeyBindings).toEqual(['undo', 'redo', 'find']);
    });
});
