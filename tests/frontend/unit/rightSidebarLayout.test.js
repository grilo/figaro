import {
    compactEditorRequired,
    rightSidebarBounds,
    rightSidebarPresentation,
    rightSidebarWidth,
} from '../frontend/js/core/rightSidebarLayout.js';

describe('right sidebar layout', () => {
    test('clamps every pane to the same workspace and editor limits', () => {
        expect(rightSidebarWidth({
            startX: 500,
            currentX: 0,
            startWidth: 320,
            workspaceWidth: 1000,
        })).toBe(600);
        expect(rightSidebarWidth({
            startX: 500,
            currentX: 0,
            startWidth: 340,
            workspaceWidth: 800,
            pdfPreview: true,
        })).toBe(400);
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
        })).toEqual({ overlay: true, width: 320, editorWidth: 600 });
        expect(rightSidebarPresentation({
            workspaceWidth: 800,
            preferredWidth: 480,
            pdfPreview: true,
        })).toEqual({ overlay: false, width: 400, editorWidth: 400 });
        expect(rightSidebarBounds({ workspaceWidth: 520, overlay: true }))
            .toEqual({ minimum: 220, maximum: 340 });
        expect(rightSidebarWidth({
            startX: 500,
            currentX: 0,
            startWidth: 320,
            workspaceWidth: 520,
            overlay: true,
        })).toBe(340);
    });
});

test('switching a narrow or wide right pane to PDF retains its requested width', () => {
    for (const width of [260, 320, 650]) {
        const ordinary = rightSidebarPresentation({ workspaceWidth: 1100, preferredWidth: width });
        expect(rightSidebarPresentation({ workspaceWidth: 1100, preferredWidth: width, pdfPreview: true })).toEqual(ordinary);
        expect(ordinary.width).toBe(width);
    }
});


test('a narrow Outline yields pane width before squeezing the writing canvas', () => {
    expect(rightSidebarPresentation({ workspaceWidth: 660, preferredWidth: 320 }))
        .toEqual({ overlay: false, width: 260, editorWidth: 400 });
});
