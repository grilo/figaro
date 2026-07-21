import { handleExternalFileDrop } from '../frontend/js/editor.js';

describe('external editor drops', () => {
    test('prevents CodeMirror from inserting a native file path as text', () => {
        const preventDefault = jest.fn();

        expect(handleExternalFileDrop({
            dataTransfer: { types: ['Files'], files: [] },
            preventDefault,
        })).toBe(true);

        expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    test('leaves ordinary text drops to CodeMirror', () => {
        const preventDefault = jest.fn();

        expect(handleExternalFileDrop({
            dataTransfer: { types: ['text/plain'], files: [] },
            preventDefault,
        })).toBe(false);

        expect(preventDefault).not.toHaveBeenCalled();
    });

    test('prevents Linux URI-list drops before they can become path text', () => {
        const preventDefault = jest.fn();

        expect(handleExternalFileDrop({
            dataTransfer: { types: ['text/uri-list', 'text/plain'], files: [] },
            preventDefault,
        })).toBe(true);

        expect(preventDefault).toHaveBeenCalledTimes(1);
    });
});
