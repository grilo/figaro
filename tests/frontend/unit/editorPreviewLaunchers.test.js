import { publishEditorUpdate } from '../frontend/js/editorUpdates.js';
import { initEditorPreviewLaunchers } from '../../../frontend/js/editorPreviewLaunchers.js';
import {
    registerRightPaneMode,
    resetRightPaneModesForTests,
} from '../../../frontend/js/rightPaneCoordinator.js';

describe('editor Raw/PDF preview launchers', () => {
    let controller;
    let activeTab;

    beforeEach(() => {
        resetRightPaneModesForTests();
        document.body.innerHTML = `
            <button id="raw-text-preview-toggle" hidden></button>
            <button id="pdf-preview-toggle" hidden></button>
            <aside id="right-sidebar"></aside>`;
        activeTab = { id: 'one', type: 'file', path: 'notes/Report.md', title: 'Report.md' };
    });

    afterEach(() => controller?.destroy());

    test('cursor bursts preserve launcher attributes and a changed pane still refreshes', async () => {
        controller = initEditorPreviewLaunchers({
            getActiveTab: () => activeTab,
            getEditorDocumentTabId: () => 'one',
        });
        const button = document.getElementById('raw-text-preview-toggle');
        const observer = new MutationObserver(() => {});
        observer.observe(button, { attributes: true });
        for (let i = 0; i < 20; i++) publishEditorUpdate({ selectionSet: true });
        await Promise.resolve();
        expect(observer.takeRecords()).toHaveLength(0);
        const sidebar = document.getElementById('right-sidebar');
        sidebar.dataset.mode = 'raw-text-preview';
        sidebar.classList.add('open');
        await Promise.resolve();
        expect(button.getAttribute('aria-expanded')).toBe('true');
        observer.disconnect();
    });

    test('shows both controls for the mounted Markdown buffer and opens exact snapshots', async () => {
        const raw = jest.fn(async () => {
            const sidebar = document.getElementById('right-sidebar');
            sidebar.classList.add('open');
            sidebar.dataset.mode = 'raw-text-preview';
        });
        const pdf = jest.fn(async () => {
            const sidebar = document.getElementById('right-sidebar');
            sidebar.classList.add('open');
            sidebar.dataset.mode = 'pdf-preview';
        });
        controller = initEditorPreviewLaunchers({
            getActiveTab: () => activeTab,
            getEditorContent: () => '# Unsaved report',
            getEditorDocumentTabId: () => 'one',
            openRawTextPreview: raw,
            openPDFPreview: pdf,
        });

        const rawButton = document.getElementById('raw-text-preview-toggle');
        const pdfButton = document.getElementById('pdf-preview-toggle');
        expect(rawButton.hidden).toBe(false);
        expect(pdfButton.hidden).toBe(false);
        rawButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(raw).toHaveBeenCalledWith({
            path: 'notes/Report.md', title: 'Report.md', content: '# Unsaved report',
        });
        expect(rawButton.getAttribute('aria-expanded')).toBe('true');

        registerRightPaneMode('raw-text-preview', () => {
            const sidebar = document.getElementById('right-sidebar');
            delete sidebar.dataset.mode;
            sidebar.classList.remove('open');
        });
        rawButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(rawButton.getAttribute('aria-expanded')).toBe('false');

        rawButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        pdfButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(pdf).toHaveBeenCalledWith({
            path: 'notes/Report.md', title: 'Report.md', content: '# Unsaved report',
        });
        expect(rawButton.getAttribute('aria-expanded')).toBe('false');
        expect(pdfButton.getAttribute('aria-expanded')).toBe('true');
    });

    test('hides launchers for non-Markdown and stale shared-editor ownership', () => {
        controller = initEditorPreviewLaunchers({
            getActiveTab: () => activeTab,
            getEditorContent: () => '',
            getEditorDocumentTabId: () => 'other',
            openRawTextPreview: jest.fn(),
            openPDFPreview: jest.fn(),
        });
        expect(document.getElementById('raw-text-preview-toggle').hidden).toBe(true);
        expect(document.getElementById('pdf-preview-toggle').hidden).toBe(true);

        activeTab = { ...activeTab, id: 'other', path: 'script.js' };
        controller.refresh();
        expect(document.getElementById('raw-text-preview-toggle').hidden).toBe(true);
        expect(document.getElementById('pdf-preview-toggle').hidden).toBe(true);
    });
});
