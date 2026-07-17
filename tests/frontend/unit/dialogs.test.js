import { confirmDialog, fileTreeStyleDialog, mergeNotesDialog, messageDialog, newNoteDialog, pdfExportErrorDialog, promptDialog, renamePathDialog, tableConversionDialog } from '../frontend/js/dialogs.js';

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

        dialog.querySelector('.custom-modal-btn-cancel').click();
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

    test('uses accessible semantics, safe destructive focus, and restores focus', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();

        const result = confirmDialog('Delete permanently?', 'This cannot be undone.', true);
        const overlay = document.querySelector('.custom-modal-overlay');
        const dialog = overlay.querySelector('[role="dialog"]');
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.classList.contains('custom-modal--danger')).toBe(true);
        const cancelButton = dialog.querySelector('.custom-modal-btn-cancel');
        const deleteButton = dialog.querySelector('.custom-modal-btn-delete');
        expect(document.activeElement).toBe(cancelButton);

        cancelButton.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        }));
        expect(document.activeElement).toBe(deleteButton);

        deleteButton.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Tab',
            bubbles: true,
            cancelable: true,
        }));
        expect(document.activeElement).toBe(cancelButton);
        cancelButton.click();

        await expect(result).resolves.toBe(false);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.activeElement).toBe(trigger);
    });

    test('keeps text-entry prompts open on backdrop clicks and validates inline', async () => {
        const result = promptDialog('New folder', 'Choose a folder name.', 'Drafts', {
            validate: value => value.includes('/') ? 'Choose a name, not a path.' : '',
        });
        const overlay = document.querySelector('.custom-modal-overlay');
        const input = overlay.querySelector('.custom-modal-input');

        overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelector('.custom-modal-overlay')).toBe(overlay);
        input.value = 'nested/path';
        overlay.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(overlay.querySelector('.custom-modal-error').textContent).toContain('name, not a path');

        input.value = 'Archive';
        input.dispatchEvent(new Event('input'));
        overlay.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await expect(result).resolves.toBe('Archive');
    });

    test('gives rename path context, selects the stem, and validates before closing', async () => {
        const result = renamePathDialog('Projects/Quarterly/report.md', 'file');
        const overlay = document.querySelector('.custom-modal-overlay');
        const input = overlay.querySelector('.custom-modal-input');
        const confirm = overlay.querySelector('.custom-modal-btn-confirm');
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(overlay.textContent).toContain('Projects/Quarterly/');
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe('report'.length);
        expect(confirm.disabled).toBe(true);

        input.value = 'nested/report.md';
        input.dispatchEvent(new Event('input'));
        overlay.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(overlay.querySelector('.custom-modal-error').textContent).toContain('name, not a path');
        expect(document.querySelector('.custom-modal-overlay')).toBe(overlay);

        input.value = 'summary.md';
        input.dispatchEvent(new Event('input'));
        expect(confirm.disabled).toBe(false);
        overlay.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await expect(result).resolves.toBe('summary.md');
    });

    test('requires at least one source and returns the selected merge order', async () => {
        const result = mergeNotesDialog('a.md', ['b.md', 'c.md']);
        const overlay = document.querySelector('.custom-modal-overlay');
        const checkboxes = [...overlay.querySelectorAll('.merge-checkbox')];
        const confirm = overlay.querySelector('.custom-modal-btn-delete');

        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));
        });
        expect(confirm.disabled).toBe(true);

        checkboxes[1].checked = true;
        checkboxes[1].dispatchEvent(new Event('change'));
        expect(confirm.disabled).toBe(false);
        confirm.click();
        await expect(result).resolves.toEqual([1]);
    });

    test('previews and confirms selection-to-table conversion with a header choice', async () => {
        const result = tableConversionDialog('Alpha\t2\nBeta\t3');
        const dialog = document.querySelector('.table-conversion-modal');
        const header = dialog.querySelector('.table-conversion-checkbox input');
        const preview = dialog.querySelector('.table-conversion-preview');

        expect(dialog.querySelector('.table-conversion-summary').textContent).toContain('Tab detected');
        expect(preview.textContent).toContain('| Alpha | 2 |');
        header.checked = false;
        header.dispatchEvent(new Event('change'));
        expect(preview.textContent).toContain('| Column 1 | Column 2 |');
        expect(preview.textContent).toContain('| Beta | 3 |');

        dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await expect(result).resolves.toBe([
            '| Column 1 | Column 2 |',
            '| --- | --- |',
            '| Alpha | 2 |',
            '| Beta | 3 |',
        ].join('\n'));
    });

    test('cancels conversion without returning replacement text and explains invalid selections', async () => {
        const result = tableConversionDialog('This is ordinary prose.');
        const dialog = document.querySelector('.table-conversion-modal');

        expect(dialog.querySelector('.table-conversion-error').textContent).toContain('CSV, TSV, or pipe-delimited');
        expect(dialog.querySelector('.custom-modal-btn-confirm').disabled).toBe(true);
        dialog.querySelector('.custom-modal-btn-cancel').click();

        await expect(result).resolves.toBeNull();
        expect(document.querySelector('.custom-modal-overlay')).toBeNull();
    });
});

describe('File-tree appearance dialog', () => {
    const lineIcon = d => [['path', { d }]];

    beforeEach(() => {
        document.body.innerHTML = '';
        window.lucide = {
            icons: {
                File: lineIcon('M4 2h10l6 6v14H4z'),
                Folder: lineIcon('M2 5h8l2 3h10v12H2z'),
                FolderHeart: lineIcon('M2 5h8l2 3h10v12H2z M12 17l-3-3'),
                Star: lineIcon('M12 2 15 9 22 9 17 14 19 22 12 18Z'),
            },
        };
    });

    afterEach(() => {
        delete window.lucide;
    });

    test('searches the Lucide catalog and applies an icon and shared palette color', async () => {
        const result = fileTreeStyleDialog({
            name: 'Projects',
            type: 'directory',
            current: { icon: 'Star', color: '#ef4444' },
            recentIcons: ['Star'],
        });
        const overlay = document.querySelector('.custom-modal-overlay');
        const search = overlay.querySelector('.file-tree-style-search');
        search.value = 'folder heart';
        search.dispatchEvent(new Event('input', { bubbles: true }));

        const match = overlay.querySelector('.file-tree-style-search-results [data-icon="FolderHeart"]');
        expect(match).toBeTruthy();
        match.click();
        overlay.querySelector('[data-color="#3b82f6"]').click();
        overlay.querySelector('.custom-modal-btn-confirm').click();

        await expect(result).resolves.toEqual({ icon: 'FolderHeart', color: '#3b82f6' });
    });

    test('reset explicitly restores both default settings', async () => {
        const result = fileTreeStyleDialog({
            name: 'note.md',
            type: 'file',
            current: { icon: 'Star', color: '#ef4444' },
            recentIcons: ['Star'],
        });
        document.querySelector('.file-tree-style-reset').click();

        await expect(result).resolves.toEqual({ icon: '', color: '' });
    });
});
