import {
    compactEditorRequired,
    rightSidebarBounds,
    rightSidebarPresentation,
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

    test('preserves the editor floor when previews open and overlays only when both panes cannot fit', () => {
        expect(rightSidebarPresentation({
            workspaceWidth: 520,
            preferredWidth: 320,
        })).toEqual({ overlay: true, width: 320, editorWidth: 520 });
        expect(rightSidebarPresentation({
            workspaceWidth: 520,
            preferredWidth: 480,
            pdfPreview: true,
        })).toEqual({ overlay: true, width: 340, editorWidth: 520 });
        expect(rightSidebarPresentation({
            workspaceWidth: 600,
            preferredWidth: 320,
        })).toEqual({ overlay: false, width: 280, editorWidth: 320 });
        expect(rightSidebarPresentation({
            workspaceWidth: 800,
            preferredWidth: 480,
            pdfPreview: true,
        })).toEqual({ overlay: false, width: 480, editorWidth: 320 });
        expect(rightSidebarBounds({ workspaceWidth: 520, overlay: true }))
            .toEqual({ minimum: 240, maximum: 340 });
        expect(rightSidebarWidth({
            startX: 500,
            currentX: 0,
            startWidth: 320,
            workspaceWidth: 520,
            overlay: true,
        })).toBe(340);
    });
});
