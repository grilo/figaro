jest.mock('../frontend/js/editor.js', () => ({
    setMarkdownBlockGuides: jest.fn(),
}));

jest.mock('../frontend/js/outline.js', () => ({
    setStickyHeadingsEnabled: jest.fn(),
    setDocumentOutlineEnabled: jest.fn(),
}));

import { setMarkdownBlockGuides as mockSetMarkdownBlockGuides } from '../frontend/js/editor.js';
import {
    setDocumentOutlineEnabled as mockSetDocumentOutlineEnabled,
    setStickyHeadingsEnabled as mockSetStickyHeadingsEnabled,
} from '../frontend/js/outline.js';

import {
    editorNavigationDefaults,
    normalizeEditorNavigationPreference,
    updateEditorNavigationPreference,
} from '../../../frontend/js/core/editorNavigationModel.js';
import {
    getEditorNavigationPreference,
    initEditorNavigationPreference,
    initEditorNavigationSettings,
} from '../../../frontend/js/editorNavigationPreferences.js';

function controls() {
    document.body.innerHTML = `
        <input type="checkbox" id="sticky-headings-toggle">
        <input type="checkbox" id="markdown-block-guides-toggle">
        <input type="checkbox" id="document-outline-toggle">
    `;
}

async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('editor navigation preferences', () => {
    test('normalizes one complete snapshot with enabled defaults', () => {
        expect(normalizeEditorNavigationPreference(null)).toEqual(editorNavigationDefaults);
        expect(normalizeEditorNavigationPreference({ stickyHeadings: false })).toEqual({
            stickyHeadings: false,
            blockGuides: true,
            documentOutline: true,
        });
        expect(updateEditorNavigationPreference(editorNavigationDefaults, 'blockGuides', false).blockGuides).toBe(false);
        expect(() => updateEditorNavigationPreference({}, 'unknown', true)).toThrow(/unknown/i);
    });

    test('loads, applies, persists, and rolls back the three controls together', async () => {
        const api = {
            EditorNavigationLoad: jest.fn().mockResolvedValue({
                stickyHeadings: false,
                blockGuides: true,
                documentOutline: true,
            }),
            EditorNavigationSave: jest.fn().mockResolvedValue({ success: true }),
        };
        window.go = { desktop: { App: api } };
        controls();

        await initEditorNavigationPreference();
        await initEditorNavigationSettings();
        expect(mockSetStickyHeadingsEnabled).toHaveBeenLastCalledWith(false);
        expect(mockSetMarkdownBlockGuides).toHaveBeenLastCalledWith(true);
        expect(mockSetDocumentOutlineEnabled).toHaveBeenLastCalledWith(true);
        expect(document.getElementById('sticky-headings-toggle').checked).toBe(false);

        const outline = document.getElementById('document-outline-toggle');
        outline.checked = false;
        outline.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(api.EditorNavigationSave).toHaveBeenLastCalledWith(false, true, false);
        expect(getEditorNavigationPreference().documentOutline).toBe(false);
        expect(mockSetDocumentOutlineEnabled).toHaveBeenLastCalledWith(false);

        api.EditorNavigationSave.mockResolvedValueOnce({ success: false, error: 'read-only settings' });
        const guides = document.getElementById('markdown-block-guides-toggle');
        guides.checked = false;
        guides.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(getEditorNavigationPreference()).toEqual({
            stickyHeadings: false,
            blockGuides: true,
            documentOutline: false,
        });
        expect(guides.checked).toBe(true);
        expect(mockSetMarkdownBlockGuides).toHaveBeenLastCalledWith(true);
        expect(guides.title).toMatch(/previous setting was restored/i);
    });
});
