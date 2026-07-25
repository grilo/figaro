import {
    compactEditorRequired,
    rightSidebarWidth,
} from '../frontend/js/core/rightSidebarLayout.js';

describe('right sidebar layout', () => {
    test('clamps history and PDF resizing to their different contracts', () => {
        expect(rightSidebarWidth({
            startX: 500,
            currentX: 0,
            startWidth: 320,
            workspaceWidth: 1000,
        })).toBe(480);
        expect(rightSidebarWidth({
            startX: 500,
            currentX: 0,
            startWidth: 340,
            workspaceWidth: 800,
            pdfPreview: true,
        })).toBe(480);
    });

    test('compacts the editor only for a narrow open PDF preview', () => {
        expect(compactEditorRequired({
            sidebarOpen: true,
            pdfPreview: true,
            editorWidth: 559,
        })).toBe(true);
        expect(compactEditorRequired({
            sidebarOpen: true,
            pdfPreview: false,
            editorWidth: 400,
        })).toBe(false);
    });
});
