import { initEditorPreviewLaunchers } from '../../../frontend/js/editorPreviewLaunchers.js';

describe('editor Raw/PDF preview launchers', () => {
    let controller;
    let activeTab;

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="raw-text-preview-toggle" hidden></button>
            <button id="pdf-preview-toggle" hidden></button>
            <aside id="right-sidebar"></aside>`;
        activeTab = { id: 'one', type: 'file', path: 'notes/Report.md', title: 'Report.md' };
    });

    afterEach(() => controller?.destroy());

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
