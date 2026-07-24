import { expect, test } from '@playwright/test';

const tableSource = [
    'Before',
    '',
    '| Name | Status | Total |',
    '| :--- | :---: | ---: |',
    '| Alpha | Ready | 12 |',
    '| Beta | Waiting | 3 |',
    '',
    'After',
].join('\n');

async function activeCell(page) {
    return page.evaluate(() => {
        const cell = document.activeElement?.closest?.('.tbl-cell');
        return cell ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) } : null;
    });
}

async function createMarkdownEditor(page, source) {
    await page.goto('/');
    await page.evaluate(async (content) => {
        const editor = await import('/js/editor.js');
        await editor.initEditor();
        const view = editor.createEditorView();
        await editor.configureEditorForFile('notes/tables.md');
        editor.setEditorContent(content);
        window.__figaroTableTestView = view;
    }, source);
}

test('creates a table from the empty-line pipe autocomplete and keeps mouse and keyboard entry cursor-safe', async ({ page }) => {
    await createMarkdownEditor(page, 'Before\n\nAfter');
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
    });

    await page.keyboard.type('|');
    const completion = page.locator('.cm-tooltip-autocomplete');
    await expect(completion).toBeVisible();
    await expect(completion.locator('li')).toHaveCount(3);
    await expect(completion).toContainText('2×2 table');
    await expect(completion).toContainText('3×3 table');
    await expect(completion).toContainText('4×4 table');
    await page.keyboard.press('Enter');

    const widget = page.locator('.tbl-table-widget');
    await expect(widget).toBeVisible();
    await expect(widget.locator('thead .tbl-cell')).toHaveCount(2);
    await expect(widget.locator('tbody .tbl-table-row')).toHaveCount(1);

    // A real mouse click must land in the generated cell editor rather than
    // in the replaced Markdown source behind the block widget.
    await widget.locator('tbody .tbl-cell-view').first().click();
    await expect(widget.locator('tbody .tbl-cell').first().locator('.tbl-cell-editor .cm-content')).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    const webkitShiftTab = await page.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
            key: 'Unidentified',
            code: 'Tab',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        const dispatched = document.activeElement.dispatchEvent(event);
        return { dispatched, defaultPrevented: event.defaultPrevented };
    });
    expect(webkitShiftTab).toEqual({ dispatched: false, defaultPrevented: true });
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Enter');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });

    // The generated widget must also retain exact document-line transitions
    // from both surrounding source lines.
    const tableBounds = await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        const lines = view.state.doc.toString().split('\n');
        const startIndex = lines.findIndex(line => line.startsWith('|'));
        let afterIndex = startIndex;
        while (afterIndex < lines.length && lines[afterIndex].startsWith('|')) afterIndex += 1;
        return { start: startIndex + 1, end: afterIndex + 1 };
    });
    await page.evaluate(({ start }) => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(start - 1).from } });
        view.focus();
    }, tableBounds);
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toEqual({ row: 0, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toBeNull();
    await page.evaluate(({ end }) => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(end).from } });
        view.focus();
    }, tableBounds);
    await page.keyboard.press('ArrowUp');
    expect((await activeCell(page))?.col).toBe(1);
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toBeNull();

    // Drag selection must cross the replaced source cleanly in either
    // direction, without the table's cell-selection layer trapping the mouse.
    const dragPoints = await page.evaluate(({ start, end }) => {
        const view = window.__figaroTableTestView;
        const point = position => {
            const coords = view.coordsAtPos(position);
            return { x: coords.left + 3, y: (coords.top + coords.bottom) / 2 };
        };
        return {
            above: point(view.state.doc.line(start - 1).from),
            below: point(view.state.doc.line(end).from),
            tableFrom: view.state.doc.line(start).from,
            tableTo: view.state.doc.line(end - 1).to,
        };
    }, tableBounds);
    for (const [origin, target] of [[dragPoints.above, dragPoints.below], [dragPoints.below, dragPoints.above]]) {
        await page.mouse.move(origin.x, origin.y);
        await page.mouse.down();
        await page.mouse.move(target.x, target.y, { steps: 8 });
        await page.mouse.up();
        const selection = await page.evaluate(() => {
            const range = window.__figaroTableTestView.state.selection.main;
            return { from: range.from, to: range.to };
        });
        expect(selection.from).toBeLessThanOrEqual(dragPoints.tableFrom);
        expect(selection.to).toBeGreaterThanOrEqual(dragPoints.tableTo);
    }
});

test('normal keyboard and context-menu paste automatically convert clear clipboard tables but preserve ordinary text', async ({ page }) => {
    await createMarkdownEditor(page, 'Before\n\nAfter');
    const keyboardPaste = await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
        const transfer = new DataTransfer();
        transfer.setData('text/plain', 'Name\tCount\nAlpha\t2');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        const dispatched = view.contentDOM.dispatchEvent(event);
        return { dispatched, defaultPrevented: event.defaultPrevented };
    });
    expect(keyboardPaste).toEqual({ dispatched: false, defaultPrevented: true });
    await expect(page.locator('.tbl-table-widget')).toBeVisible();
    await expect(page.locator('.tbl-table-widget tbody .tbl-table-row')).toHaveCount(1);
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toContain('Alpha');

    // The existing Paste menu action follows the same conversion path; there
    // is deliberately no separate “Paste as table” command.
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Before\n\nAfter' } });
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText: async () => 'Item\tStatus\nDraft\tReady' },
        });
        const coords = view.coordsAtPos(view.state.doc.line(2).from);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 2,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    });
    await page.locator('.editor-context-menu [data-action="paste"]').click();
    await expect(page.locator('.tbl-table-widget')).toBeVisible();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toContain('Draft');

    const existingGFM = '| Existing | Count |\n| --- | --- |\n| Alpha | 2 |';
    await page.evaluate((source) => {
        const view = window.__figaroTableTestView;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Before\n\nAfter' } });
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText: async () => source },
        });
        const coords = view.coordsAtPos(view.state.doc.line(2).from);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 2,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    }, existingGFM);
    await page.locator('.editor-context-menu [data-action="paste"]').click();
    const pastedGFM = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    expect(pastedGFM).toContain('| Existing');
    expect(pastedGFM).toContain('| Alpha');
    expect(pastedGFM).not.toContain('| After');
    expect(pastedGFM).toMatch(/\n\nAfter$/);

    const plainFallthrough = await page.evaluate(async () => {
        const tables = await import('/js/clipboardTable.js');
        const view = window.__figaroTableTestView;
        const transfer = new DataTransfer();
        transfer.setData('text/plain', 'This remains ordinary prose.');
        const preventDefault = () => { window.__plainPastePrevented = true; };
        window.__plainPastePrevented = false;
        const claimed = tables.handleClipboardTablePaste({ clipboardData: transfer, preventDefault }, view);
        return { claimed, prevented: window.__plainPastePrevented };
    });
    expect(plainFallthrough).toEqual({ claimed: false, prevented: false });

    const nonMarkdownPaste = await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        const view = window.__figaroTableTestView;
        await editor.configureEditorForFile('notes/data.txt');
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Before\n\nAfter' } });
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
        const transfer = new DataTransfer();
        transfer.setData('text/plain', 'Name\tCount\nAlpha\t2');
        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        });
        view.contentDOM.dispatchEvent(event);
        return view.state.doc.toString();
    });
    expect(nonMarkdownPaste).not.toContain('| Name');
});

test('previews selection conversion and leaves the source untouched on cancellation before one undoable replacement', async ({ page }) => {
    const source = 'Before\n\nName,Count\nAlpha,2\nBeta,3\n\nAfter';
    await createMarkdownEditor(page, source);

    const openConversion = async () => page.evaluate(() => {
        const view = window.__figaroTableTestView;
        const text = view.state.doc.toString();
        const from = text.indexOf('Name,Count');
        const to = text.indexOf('\n\nAfter');
        view.dispatch({ selection: { anchor: from, head: to } });
        view.focus();
        const coords = view.coordsAtPos(from + 2);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 2,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    });

    await openConversion();
    await page.locator('.editor-context-menu [data-action="convert-table"]').click();
    const dialog = page.locator('.table-conversion-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.table-conversion-summary')).toContainText('Comma detected');
    await expect(dialog.locator('.table-conversion-preview')).toContainText('| Name | Count |');
    await dialog.locator('.custom-modal-btn-cancel').click();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(source);

    await openConversion();
    await page.locator('.editor-context-menu [data-action="convert-table"]').click();
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ changes: { from: view.state.doc.length, insert: '\nConcurrent edit' } });
    });
    await page.locator('.table-conversion-modal .custom-modal-btn-confirm').click();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString()))
        .toBe(`${source}\nConcurrent edit`);
    await page.evaluate((original) => {
        const view = window.__figaroTableTestView;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: original } });
    }, source);

    await openConversion();
    await page.locator('.editor-context-menu [data-action="convert-table"]').click();
    await page.locator('.table-conversion-modal .custom-modal-btn-confirm').click();
    await expect(page.locator('.tbl-table-widget')).toBeVisible();
    await expect(page.locator('.tbl-table-widget tbody .tbl-table-row')).toHaveCount(2);
    const converted = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    expect(converted).toContain('| Name');
    expect(converted).toContain('| Alpha');
    expect(converted).not.toContain('Name,Count');

    await page.evaluate(() => window.__figaroTableTestView.focus());
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect.poll(() => page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(source);
});

test('themes the table delimiter combobox and operates it by keyboard', async ({ page }) => {
    const source = 'Name,Count\nAlpha,2';
    await createMarkdownEditor(page, source);
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
        const coords = view.coordsAtPos(2);
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: coords.left + 2,
            clientY: (coords.top + coords.bottom) / 2,
        }));
    });
    await page.locator('.editor-context-menu [data-action="convert-table"]').click();

    const trigger = page.locator('.table-conversion-combobox .select-combobox-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('role', 'combobox');
    const styles = await trigger.evaluate(element => {
        const computed = getComputedStyle(element);
        return { background: computed.backgroundColor, border: computed.borderStyle, radius: Number.parseFloat(computed.borderRadius) };
    });
    expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.border).toBe('solid');
    expect(styles.radius).toBeGreaterThanOrEqual(6);

    await trigger.press('ArrowDown');
    await trigger.press('End');
    await trigger.press('Enter');
    await expect(trigger).toContainText('Pipe');
    await page.locator('.table-conversion-modal .custom-modal-btn-cancel').click();
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(source);
});

test('renders interactive Markdown tables and keeps cursor movement bounded to adjacent lines and cells', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async (source) => {
        const editor = await import('/js/editor.js');
        await editor.initEditor();
        const view = editor.createEditorView();
        editor.setEditorContent(source);
        window.__figaroTableTestView = view;
    }, tableSource);

    const widget = page.locator('.tbl-table-widget');
    await expect(widget).toBeVisible();
    await expect(widget.locator('thead .tbl-cell')).toHaveCount(3);
    await expect(widget.locator('tbody .tbl-table-row')).toHaveCount(2);
    await expect(widget.locator('tbody .tbl-cell').nth(1)).toHaveAttribute('align', 'center');
    await expect(widget.locator('tbody .tbl-cell').nth(2)).toHaveAttribute('align', 'right');

    // Arrow Down from the source line above enters the first cell; Arrow Up
    // leaves it on exactly that adjacent source line rather than skipping.
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toEqual({ row: 0, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(2);

    // The reverse transition enters the final cell and returns to the source
    // line below, exercising CodeMirror's measured block height both ways.
    await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        view.dispatch({ selection: { anchor: view.state.doc.line(7).from } });
        view.focus();
    });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toEqual({ row: 2, col: 2 });
    await page.keyboard.press('ArrowDown');
    expect(await activeCell(page)).toBeNull();
    expect(await page.evaluate(() => {
        const view = window.__figaroTableTestView;
        return view.state.doc.lineAt(view.state.selection.main.head).number;
    })).toBe(7);

    // Clicking exposes the cell editor. Once active, Tab/Shift+Tab move
    // horizontally, Enter moves down, and Arrow Up returns up the column.
    await widget.locator('tbody .tbl-cell-view').first().click();
    await expect(widget.locator('tbody .tbl-cell').first().locator('.tbl-cell-editor .cm-content')).toBeFocused();
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 1 });
    await page.keyboard.press('Shift+Tab');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
    await page.keyboard.press('Enter');
    expect(await activeCell(page)).toEqual({ row: 2, col: 0 });
    await page.keyboard.press('ArrowUp');
    expect(await activeCell(page)).toEqual({ row: 1, col: 0 });
});

test('uses Vim Normal and Insert modes inside interactive Markdown table cells', async ({ page }) => {
    await createMarkdownEditor(page, tableSource);
    await page.evaluate(async () => {
        const editor = await import('/js/editor.js');
        await editor.toggleVim(true);
    });

    const firstBodyCell = page.locator('.tbl-table-widget tbody .tbl-cell-view').first();
    await firstBodyCell.click();
    const cellEditor = page.locator('.tbl-table-widget tbody .tbl-cell-editor .cm-content').first();
    await expect(cellEditor).toBeFocused();
    const before = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());

    await cellEditor.press('j');
    expect(await page.evaluate(() => window.__figaroTableTestView.state.doc.toString())).toBe(before);

    await cellEditor.press('i');
    await cellEditor.press('x');
    await cellEditor.press('Escape');
    const afterInsert = await page.evaluate(() => window.__figaroTableTestView.state.doc.toString());
    expect(afterInsert).not.toBe(before);
    expect(afterInsert).toContain('x');
    expect(afterInsert).not.toContain('j');
});

test('keeps aligned Markdown tables semantic and styled in PDF preview and generated PDF layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.markdownit === 'function');

    const rendered = await page.evaluate(async (source) => {
        const pdf = await import('/js/pdfExport.js');
        const preview = await import('/js/pdfPreview.js');
        const printableHTML = pdf.renderPrintableMarkdown(source, 'Table report');
        const previewHTML = preview.buildPDFPreviewDocument(printableHTML, { notePath: 'reports/table.md' });
        const document = new DOMParser().parseFromString(previewHTML, 'text/html');
        const table = document.querySelector('.figaro-print-document table');
        return {
            previewHTML,
            rows: table.querySelectorAll('tbody tr').length,
            headerAlignments: Array.from(table.querySelectorAll('th')).map(cell => cell.style.textAlign),
            cellAlignments: Array.from(table.querySelectorAll('tbody tr:first-child td')).map(cell => cell.style.textAlign),
            previewBody: document.body.classList.contains('figaro-pdf-preview-body'),
        };
    }, tableSource);

    expect(rendered.rows).toBe(2);
    expect(rendered.headerAlignments).toEqual(['left', 'center', 'right']);
    expect(rendered.cellAlignments).toEqual(['left', 'center', 'right']);
    expect(rendered.previewBody).toBe(true);

    await page.setContent(rendered.previewHTML, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const layout = await page.locator('.figaro-print-document table').evaluate(table => {
        const firstCell = table.querySelector('tbody td');
        const styles = getComputedStyle(firstCell);
        return {
            display: getComputedStyle(table).display,
            width: table.getBoundingClientRect().width,
            height: table.getBoundingClientRect().height,
            borderStyle: styles.borderStyle,
            borderWidth: styles.borderWidth,
        };
    });
    expect(layout.display).toBe('table');
    expect(layout.width).toBeGreaterThan(200);
    expect(layout.height).toBeGreaterThan(40);
    expect(layout.borderStyle).toBe('solid');
    expect(Number.parseFloat(layout.borderWidth)).toBeGreaterThan(0);

    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(5000);
});
