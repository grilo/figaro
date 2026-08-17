import { createDocumentKeyBindings } from '../frontend/js/codeMirrorProfiles.js';

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
});
