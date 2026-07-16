import { messageDialog, newNoteDialog, pdfExportErrorDialog } from '../frontend/js/dialogs.js';

describe('New note dialog', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('communicates the target folder and uses an in-input Markdown default', async () => {
        const result = newNoteDialog('Projects/Planning');
        const overlay = document.querySelector('.custom-modal-overlay');
        expect(overlay.textContent).toContain('Projects/Planning/');

        const input = overlay.querySelector('#new-note-name');
        expect(input.value).toBe('Untitled.md');
        input.value = 'Quarterly plan';
        overlay.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        await expect(result).resolves.toBe('Quarterly plan.md');
        expect(document.querySelector('.custom-modal-overlay')).toBeNull();
    });

    test('preserves an explicitly supplied file extension', async () => {
        const result = newNoteDialog('Themes');
        const overlay = document.querySelector('.custom-modal-overlay');
        overlay.querySelector('#new-note-name').value = 'print.css';
        overlay.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        await expect(result).resolves.toBe('print.css');
    });

    test('keeps the dialog open with an understandable validation message for a path', async () => {
        const result = newNoteDialog('');
        const overlay = document.querySelector('.custom-modal-overlay');
        const input = overlay.querySelector('#new-note-name');
        input.value = 'notes/escape';
        overlay.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        const error = overlay.querySelector('.new-note-error');
        expect(error.hidden).toBe(false);
        expect(error.textContent).toContain('name, not a path');
        expect(document.querySelector('.custom-modal-overlay')).not.toBeNull();

        overlay.querySelector('.custom-modal-btn-cancel').click();
        await expect(result).resolves.toBeNull();
    });

    test('cleanly cancels a previous dialog before opening another one', async () => {
        const first = newNoteDialog('First');
        const second = newNoteDialog('Second');

        await expect(first).resolves.toBeNull();
        const overlay = document.querySelector('.custom-modal-overlay');
        expect(overlay.textContent).toContain('Second/');
        overlay.querySelector('.custom-modal-btn-cancel').click();
        await expect(second).resolves.toBeNull();
    });

    test('shows an operation-refused message with one acknowledgement action', async () => {
        const result = messageDialog(
            'Operation refused',
            'A folder cannot be copied into itself or one of its descendants because that would cause a recursive copy. Select its parent folder to create a sibling copy instead.'
        );
        const overlay = document.querySelector('.custom-modal-overlay');

        expect(overlay.textContent).toContain('Operation refused');
        expect(overlay.textContent).toContain('recursive copy');
        expect(overlay.textContent).toContain('Select its parent folder');
        expect(overlay.querySelector('.custom-modal-btn-cancel')).toBeNull();
        overlay.querySelector('.custom-modal-btn-confirm').click();

        await expect(result).resolves.toBeUndefined();
        expect(document.querySelector('.custom-modal-overlay')).toBeNull();
    });

    test('explains a missing browser engine with an in-app PDF export dialog', async () => {
        const result = pdfExportErrorDialog(new Error('No browser engine was found for interactive PDF export.'));
        const dialog = document.querySelector('.pdf-export-error-modal');

        expect(dialog).toBeTruthy();
        expect(dialog.textContent).toContain('A browser is needed for PDF export');
        expect(dialog.textContent).toContain('Ungoogled Chromium');
        expect(dialog.textContent).toContain('clickable');

        dialog.querySelector('.custom-modal-btn-confirm').click();
        await expect(result).resolves.toBeUndefined();
        expect(document.querySelector('.custom-modal-overlay')).toBeNull();
    });

    test('offers the native browser chooser directly after automatic discovery fails', async () => {
        window.pywebview.api.pdf_browser_choose.mockResolvedValueOnce({
            success: true,
            path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            engine: 'edge',
        });
        const result = pdfExportErrorDialog(new Error('No browser engine was found for interactive PDF export.'));
        const dialog = document.querySelector('.pdf-export-error-modal');

        dialog.querySelector('.pdf-browser-choose-btn').click();
        await expect(result).resolves.toBeUndefined();
        expect(window.pywebview.api.pdf_browser_choose).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.custom-modal-overlay')).toBeNull();
    });

    test('explains when an exported PDF could not be opened automatically', async () => {
        const result = pdfExportErrorDialog(new Error('viewer command failed'), {
            exportedPath: 'Projects/Quarterly review.pdf',
        });
        const dialog = document.querySelector('.pdf-export-error-modal');

        expect(dialog.textContent).toContain('PDF exported, but not opened');
        expect(dialog.textContent).toContain('Projects/Quarterly review.pdf');
        dialog.querySelector('.custom-modal-btn-confirm').click();
        await expect(result).resolves.toBeUndefined();
    });
});
