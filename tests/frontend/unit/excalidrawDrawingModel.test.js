import {
    isDrawingEdit,
    isNewerDrawingFile,
    shouldReloadDrawing,
} from '../frontend/js/core/excalidrawDrawingModel.js';

describe('Excalidraw drawing decisions', () => {
    test('only a new scene version after the loaded baseline is an edit', () => {
        expect(isDrawingEdit(null, 5)).toBe(false);
        expect(isDrawingEdit(5, 5)).toBe(false);
        expect(isDrawingEdit(5, 6)).toBe(true);
    });

    test('reloads a clean drawing whose file changed, never unsaved work', () => {
        const path = 'Sketches/board.excalidraw.svg';
        expect(shouldReloadDrawing({ scope: [path], path, dirty: false, saving: false })).toBe(true);
        expect(shouldReloadDrawing({ scope: null, path, dirty: false, saving: false })).toBe(true);
        expect(shouldReloadDrawing({ scope: ['Notes/a.md'], path, dirty: false, saving: false })).toBe(false);
        expect(shouldReloadDrawing({ scope: [], path, dirty: false, saving: false })).toBe(false);
        expect(shouldReloadDrawing({ scope: [path], path, dirty: true, saving: false })).toBe(false);
        expect(shouldReloadDrawing({ scope: [path], path, dirty: false, saving: true })).toBe(false);
    });

    test('a reload is needed only when the file is not the one already shown', () => {
        expect(isNewerDrawingFile({ mtime: 11 }, 10)).toBe(true);
        expect(isNewerDrawingFile({ mtime: 10 }, 10)).toBe(false);
        expect(isNewerDrawingFile(null, 10)).toBe(false);
    });
});
